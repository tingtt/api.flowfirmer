import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../lib/mysql"
import jwt from "jsonwebtoken"

type Document = {
  id: number
  title: string
  url: string
  tags: Array<any>
  document_tags: Array<any>
}

type Data =
  | {
      message: string
    }
  | Document
  | Document[]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // Tokenの確認
  const sended_token =
    req.cookies.token != undefined ? req.cookies.token : req.cookies.TOKEN

  if (sended_token == undefined) {
    res.setHeader("WWW-Authenticate", `Bearer error="token_required"`)
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  let user_id: number

  try {
    // privateKeyの確認
    if (typeof process.env.JWT_SECRET != "string") {
      res.status(500).json({ message: "Error: JWT secret does not exits" })
      return
    }
    const decoded: any = jwt.verify(sended_token, process.env.JWT_SECRET)
    if (
      typeof decoded != "object" ||
      !decoded.hasOwnProperty("user_id") ||
      typeof decoded.user_id != "number" ||
      !decoded.hasOwnProperty("iat") ||
      typeof decoded.iat != "number" ||
      !decoded.hasOwnProperty("exp") ||
      typeof decoded.exp != "number" ||
      !decoded.hasOwnProperty("iss") ||
      typeof decoded.iss != "string" ||
      decoded.iss != "flow firmer"
    ) {
      throw new Error("")
    }

    user_id = decoded.user_id
  } catch (_) {
    res.setHeader("WWW-Authenticate", `Bearer error="invalid_token"`)
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  if (req.method == "POST") {
    // Content-Type: "application/json"が指定されているかチェック
    if (
      !req.headers.hasOwnProperty("content-type") ||
      req.headers["content-type"] != "application/json"
    ) {
      res.status(415).json({ message: "Unsupported media type" })
      return
    }

    // Bodyに必要なキーが含まれているかどうかチェック
    if (!req.body.hasOwnProperty("title") || !req.body.hasOwnProperty("url")) {
      res.status(400).json({ message: "Invalid request" })
      return
    }

    // tag_idsのチェック
    if (req.body.tag_ids != undefined && !Array.isArray(req.body.tag_ids)) {
      res.status(415).json({ message: "Unprocessable entity (tag_ids)" })
      return
    }

    // document_tag_idsのチェック
    if (
      req.body.document_tag_ids != undefined &&
      !Array.isArray(req.body.document_tag_ids)
    ) {
      res
        .status(415)
        .json({ message: "Unprocessable entity (document_tag_ids)" })
      return
    }

    let tag_ids: number[] = Array.isArray(req.body.tag_ids)
      ? (req.body.tag_ids as Array<any>)
          .map((value: any) => +value)
          .filter((value) => !isNaN(value) && value != Infinity)
      : []
    let document_tag_ids: number[] = Array.isArray(req.body.document_tag_ids)
      ? (req.body.document_tag_ids as Array<any>)
          .map((value: any) => +value)
          .filter((value) => !isNaN(value) && value != Infinity)
      : []
    let document_id: number

    try {
      let tags: any[] = []

      // tagの取得
      if (tag_ids.length > 0) {
        // クエリ発行 `tags`
        tags = (await query(
          `SELECT id, name, theme_color, pinned, \`order\`, hidden FROM tags WHERE user_id = ? AND id IN (${tag_ids
            .map((_) => "?")
            .join(",")})`,
          [user_id, ...tag_ids]
        )) as any[]
      }

      // 不正なtagが指定された場合
      if (tag_ids.length != tags.length) {
        res.status(404).json({
          message: `Tag not found (id: ${tag_ids.filter(
            (id) => !tags.some((tag) => tag.id == id)
          )})`,
        })
        return
      }

      let document_tags: any[] = []

      // document_tagの取得
      if (document_tag_ids.length > 0) {
        // クエリ発行 `document_tags`
        document_tags = (await query(
          `SELECT id, name FROM document_tags WHERE user_id = ? AND id IN (${document_tag_ids
            .map((_) => "?")
            .join(",")})`,
          [user_id, ...document_tag_ids]
        )) as any[]
      }

      // 不正なbookmark_tagが指定された場合
      if (document_tag_ids.length != document_tags.length) {
        res.status(404).json({
          message: `BookmarkTag not found (id: ${document_tag_ids.filter(
            (id) => !document_tags.some((bookmark_tag) => bookmark_tag.id == id)
          )})`,
        })
        return
      }

      // クエリ発行 `documents`
      const documentInsertQueryResult: any = await query(
        "INSERT INTO documents (user_id, title, url) VALUES (?, ?, ?);",
        [user_id, req.body.title, req.body.url]
      )

      // insertIdの確認
      if (typeof documentInsertQueryResult != "object") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      if (!documentInsertQueryResult.hasOwnProperty("insertId")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof documentInsertQueryResult.insertId != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      document_id = documentInsertQueryResult.insertId

      // tagとのmap（紐付け情報）の登録
      if (tags.length > 0) {
        // クエリ発行 `document_tag_maps`
        query(
          `INSERT INTO document_tag_maps (document_id, tag_id) VALUES ${tags
            .map((_) => "(?, ?)")
            .join(",")}`,
          tags.map((tag: any) => +tag.id).flatMap((id) => [document_id, id])
        ).then((result: any) => {
          if (
            typeof result != "object" ||
            !result.hasOwnProperty("insertId") ||
            typeof result.insertId != "number"
          ) {
            console.log(
              `Error: Query failed to insert into \`document_tag_maps\`.)`
            )
          }
        })
        // TODO: mapの登録失敗時のDELETE処理
      }

      // bookmark_tagとのmap（紐付け情報）の登録
      if (document_tags.length > 0) {
        // クエリ発行 `document_document_tag_maps`
        query(
          `INSERT INTO document_document_tag_maps (document_id, document_tag_id) VALUES ${document_tags
            .map((_) => "(?, ?)")
            .join(",")}`,
          document_tags
            .map((document_tag: any) => +document_tag.id)
            .flatMap((id) => [document_id, id])
        ).then((result: any) => {
          if (
            typeof result != "object" ||
            !result.hasOwnProperty("insertId") ||
            typeof result.insertId != "number"
          ) {
            console.log(
              `Error: Query failed to insert into \`document_document_tag_maps\`.)`
            )
          }
        })
        // TODO: mapの登録失敗時のDELETE処理
      }

      // 登録情報取得用のエンドポイント
      res.setHeader("Location", `tags/${document_id}`)

      res.status(201).json({
        id: document_id,
        title: req.body.title,
        url: req.body.url,
        tags: tags,
        document_tags: document_tags,
      })
      return
    } catch (e) {
      let msg = ""
      if (e instanceof Error) {
        msg = e.message
      } else {
        msg = "Error: Query execution failed."
      }
      res.status(500).json({ message: msg })
      return
    }
  } else if (req.method == "GET") {
    try {
      // クエリ発行
      const selectQueryResult: any = await query(
        `SELECT
          documents.id, documents.title, documents.url,
          COALESCE(CONCAT('[', TRIM(TRAILING ',' FROM GROUP_CONCAT(DISTINCT '{\"id\":', tags.id, ',\"name\":\"', tags.name, '\",\"theme_color\":\"', tags.theme_color, '\",\"parent_id\":', COALESCE(tags.parent_id, 'null'), ',\"pinned\":', tags.pinned, ',\"order\":', tags.\`order\`, ',\"hidden\":', tags.hidden, '}')), ']'), '[]') as tags,
          COALESCE(CONCAT('[', TRIM(TRAILING ',' FROM GROUP_CONCAT(DISTINCT '{\"id\":', document_tags.id, ',\"name\":\"', document_tags.name, '\"}')), ']'), '[]') as document_tags
        FROM
          documents
        LEFT JOIN document_tag_maps
          ON documents.id = document_tag_maps.document_id
        LEFT JOIN tags
          ON document_tag_maps.tag_id = tags.id
        LEFT JOIN document_document_tag_maps
          ON documents.id = document_document_tag_maps.document_id
        LEFT JOIN document_tags
          ON document_document_tag_maps.document_tag_id = document_tags.id
        WHERE documents.user_id = ?
        GROUP BY documents.id;`,
        [user_id]
      )

      // クエリ結果のチェック
      if (!Array.isArray(selectQueryResult)) {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      const parsedSelectQueryResult = selectQueryResult.map((row) => {
        row.tags = JSON.parse(row.tags)
        row.document_tags = JSON.parse(row.document_tags)
        return row
      })

      res.status(200).json(parsedSelectQueryResult as Document[])
      return
    } catch (e) {
      let msg = ""
      if (e instanceof Error) {
        msg = e.message
      } else {
        msg = "Error: Query execution failed."
      }
      res.status(500).json({ message: msg })
      return
    }
  } else {
    res.status(405).json({ message: "Method not allowed" })
  }
}

//curl -v -X POST -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"title":"document1","url":"https://~~~"}' localhost/api/documents
//curl -v -X GET -H "Cookie: TOKEN=<token>" localhost/api/documents
