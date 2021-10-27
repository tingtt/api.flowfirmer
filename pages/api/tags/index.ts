import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../lib/mysql"
import jwt from "jsonwebtoken"

type Tag = {
  id: number
  name: string
  theme_color: string
  parent_id?: number
  user_id: number
  pinned: boolean
  order?: number
  hidden?: boolean
  sub_tags?: Array<Tag>
}

type Data =
  | {
      message: string
    }
  | Tag
  | Tag[]

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
    if (!req.body.hasOwnProperty("name")) {
      res.status(400).json({ message: "Invalid request" })
      return
    }

    // デフォルトのカラードード
    let theme_color = "ecf0f1"

    // カラーコードのバリデーション
    if (req.body.hasOwnProperty("theme_color")) {
      if (
        typeof req.body.theme_color != "string" ||
        (req.body.theme_color as string).match(
          /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
        ) == null
      ) {
        res.status(422).json({ message: "Unprocessable entity (theme_color)" })
        return
      }
      theme_color = req.body.theme_color
    }

    let tag_id: number
    let parent_id: number | null = null
    let pinned: boolean = Boolean(req.body.pinned)

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

      // クエリ発行
      const insertQueryResult: any = await query(
        "INSERT INTO tags (user_id, name, theme_color, parent_id, pinned) values (?, ?, ?, ?, ?);",
        [user_id, req.body.name, theme_color, parent_id, pinned]
      )

      // insertIdの確認
      if (!insertQueryResult.hasOwnProperty("insertId")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof insertQueryResult.insertId != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      tag_id = insertQueryResult.insertId
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

    // 登録情報取得用のエンドポイント
    res.setHeader("Location", `tags/${tag_id}`)

    res.status(201).json(
      parent_id != null
        ? {
            id: tag_id,
            name: req.body.name,
            theme_color: theme_color,
            parent_id: parent_id,
            user_id: user_id,
            pinned: pinned,
          }
        : {
            id: tag_id,
            name: req.body.name,
            theme_color: theme_color,
            user_id: user_id,
            pinned: pinned,
          }
    )
  } else if (req.method == "GET") {
    try {
      // クエリ発行
      const selectQueryResult: any = await query(
        `SELECT
          parent.id, parent.name, parent.theme_color, parent.pinned, parent.\`order\`, parent.hidden,
          CONCAT('[', TRIM(TRAILING ',' FROM GROUP_CONCAT('{\"id\":', child.id, ',\"name\":\"', child.name, '\",\"theme_color\":\"', child.theme_color, '\",\"parent_id\":', child.parent_id, ',\"pinned\":', child.pinned, ',\"order\":', child.\`order\`, ',\"hidden\":', child.hidden, '}')), ']') as tags
        FROM
          tags parent
        LEFT JOIN tags child
          ON parent.id = child.parent_id
        WHERE
          parent.user_id = ?
          AND child.user_id = ?
          AND parent.parent_id is NULL
        GROUP BY parent.id;`,
        [user_id, user_id]
      )

      // クエリ結果のチェック
      if (!Array.isArray(selectQueryResult)) {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      const parsedSelectQueryResult = selectQueryResult.map((row) => {
        row.tags = JSON.parse(row.tags)
        return row
      })

      res.status(200).json(parsedSelectQueryResult as Tag[])
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

//curl -v -X POST -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"name":"tag_name"}' localhost/api/tags
//curl -v -X GET -H "Cookie: TOKEN=<token>" localhost/api/tags?show_hidden=false
