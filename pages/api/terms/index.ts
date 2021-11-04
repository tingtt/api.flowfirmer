import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../lib/mysql"
import jwt from "jsonwebtoken"

type Term = {
  id: number
  user_id: number
  name: string
  description: string
  start: string
  end: string
  parent_id?: number
  sub_terms?: Array<Term>
  tags?: Array<any>
}

type Data =
  | {
      message: string
    }
  | Term
  | Term[]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // Tokenの確認
  const sended_token =
    req.cookies.token != undefined ? req.cookies.token : req.cookies.TOKEN

  if (sended_token == undefined) {
    res.setHeader("WWW-Authenticate", `Bearer error="token_required`)
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

  //リクエスト POST
  if (req.method == "POST") {
    // Content-Type: "application/json"が指定されているかチェック
    if (
      !req.headers.hasOwnProperty("content-type") ||
      req.headers["content-type"] != "application/json"
    ) {
      res.status(415).json({ message: "Unsupported media type" })
      return
    }

    //Bodyに必要なキーが含まれているかどうかチェックする
    if (
      !req.body.hasOwnProperty("name") ||
      !req.body.hasOwnProperty("start") ||
      !req.body.hasOwnProperty("end")
    ) {
      res.status(400).json({ message: "Invalid request" })
      return
    }

    // 日付のバリデーション
    let start: string
    let end: string

    let reg = /^([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}-[0-9]{2})$/
    let month_reg = /^([0-9]{2}-[0-9]{2})$/

    if (typeof req.body.start != "string" || reg.test(req.body.start) == null) {
      res.status(422).json({ message: "Unprocessable entity (start)" })
      return
    }

    if (month_reg.test(req.body.start)) {
      start = `${new Date().getFullYear()}-${req.body.start}`
    } else {
      start = req.body.start
    }

    if (typeof req.body.end != "string" || reg.test(req.body.end) == null) {
      res.status(422).json({ message: "Unprocessable entity (end)" })
      return
    }
    end = req.body.end

    if (month_reg.test(req.body.end)) {
      end = `${new Date().getFullYear()}-${req.body.end}`
    } else {
      end = req.body.end
    }

    // tag_idsのチェック
    if (req.body.tag_ids != undefined && !Array.isArray(req.body.tag_ids)) {
      res.status(422).json({ message: "Unprocessable entity (tag_ids)" })
      return
    }

    let tag_ids: number[] = Array.isArray(req.body.tag_ids)
      ? (req.body.tag_ids as Array<any>)
          .map((value: any) => +value)
          .filter((value) => !isNaN(value) && value != Infinity)
      : []

    let term_id: number
    let parent_id: number | null = null

    try {
      // parent_idのバリデーション
      if (req.body.hasOwnProperty("parent_id")) {
        if (
          typeof req.body.parent_id != "number" &&
          (isNaN(+req.body.parent_id) || +req.body.parent_id == Infinity)
        ) {
          res.status(422).json({ message: "Unprocessable entity (parent_id)" })
          return
        }

        parent_id = +req.body.parent_id
      }

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

      // クエリ発行
      const termInsertQueryResult: any = await query(
        "INSERT INTO terms (user_id, name, description, start, end, parent_id) VALUES (?, ?, ?, ?, ?, ?);",
        [user_id, req.body.name, req.body.description, start, end, parent_id]
      )

      // insertIdの確認
      if (!termInsertQueryResult.hasOwnProperty("insertId")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof termInsertQueryResult.insertId != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      term_id = termInsertQueryResult.insertId

      // tagとのmap（紐付け情報）の登録
      if (tags.length > 0) {
        // クエリ発行 `document_tag_maps`
        query(
          `INSERT INTO term_tag_maps (term_id, tag_id) VALUES ${tags
            .map((_) => "(?, ?)")
            .join(",")}`,
          tags.map((tag: any) => +tag.id).flatMap((id) => [term_id, id])
        ).then((result: any) => {
          if (
            typeof result != "object" ||
            !result.hasOwnProperty("insertId") ||
            typeof result.insertId != "number"
          ) {
            console.log(
              `Error: Query failed to insert into \`term_tag_maps\`.)`
            )
          }
        })
        // TODO: mapの登録失敗時のDELETE処理
      }

      // 登録情報取得用のエンドポイント
      res.setHeader("Location", `terms/${term_id}`)

      res.status(201).json(
        parent_id != null
          ? {
              id: term_id,
              user_id: user_id,
              name: req.body.name,
              description: req.body.description,
              start: start,
              end: end,
              parent_id: parent_id,
              tags: tags,
            }
          : {
              id: term_id,
              user_id: user_id,
              name: req.body.name,
              description: req.body.description,
              start: start,
              end: end,
              tags: tags,
            }
      )
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
      //クエリ発行
      const selectQueryResult: any = await query(
        `SELECT
          parent.id, parent.name, parent.description, date_format(parent.start, '%Y-%m-%d') start, date_format(parent.end, '%Y-%m-%d') end,
          COALESCE(CONCAT('[', TRIM(TRAILING ',' FROM GROUP_CONCAT(DISTINCT '{\"id\":', tags.id, ',\"name\":\"', tags.name, '\",\"theme_color\":\"', tags.theme_color, '\",\"parent_id\":', COALESCE(tags.parent_id, 'null'), ',\"pinned\":', tags.pinned, ',\"order\":', tags.\`order\`, ',\"hidden\":', tags.hidden, '}')),']'), '[]') tags,
          COALESCE(CONCAT('[', TRIM(TRAILING ',' FROM GROUP_CONCAT(DISTINCT '{\"id\":', childs.id, ',\"name\":\"', childs.name, '\",\"description\":', COALESCE(CONCAT('\"', childs.description, '\"'), 'null'), ',\"start\":\"', date_format(childs.start, '%Y-%m-%d'), '\",\"end\":\"', date_format(childs.end, '%Y-%m-%d'), '\"}')), ']'), '[]') as sub_terms
        FROM
          terms parent
        LEFT JOIN terms childs
          ON childs.parent_id = parent.id
        LEFT JOIN term_tag_maps
          ON parent.id = term_tag_maps.term_id
        LEFT JOIN tags
          ON term_tag_maps.tag_id = tags.id
        WHERE
          parent.user_id = ? AND childs.user_id = ? AND parent.parent_id is NULL
        GROUP BY parent.id;`,
        [user_id, user_id]
      )

      // クエリ結果のチェック
      if (!Array.isArray(selectQueryResult)) {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      const parsedSelectQueryResult = selectQueryResult.map((row) => {
        row.sub_terms = JSON.parse(row.sub_terms)
        row.tags = JSON.parse(row.tags)
        return row
      })

      res.status(200).json(parsedSelectQueryResult as Term[])
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
    res.status(405).json({ message: "Method Not Allowed" })
  }
}

//curl -v -X POST -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"name":"term_name","description":"hello world","start":"2021-10-22","end":"2021-10-29","parent_id":14,"tag_ids":[1]}' localhost/api/terms
//curl -v -X GET -H "Cookie: TOKEN=<token>" localhost/api/terms?page=14&range=week&num=1&start_on_monday=false"
