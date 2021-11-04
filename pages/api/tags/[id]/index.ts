import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../../lib/mysql"
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

  const { id } = req.query
  if (isNaN(+id) || +id == Infinity) {
    res.status(404).json({ message: "Page not found" })
    return
  }
  const tag_id = +id

  if (req.method == "GET") {
    try {
      // クエリ発行
      const selectQueryResult: any = await query(
        `SELECT
          parent.id, parent.name, parent.theme_color, parent.pinned, parent.\`order\`, parent.hidden,
          CONCAT('[', TRIM(TRAILING ',' FROM GROUP_CONCAT('{\"id\":', childs.id, ',\"name\":\"', childs.name, '\",\"theme_color\":\"', childs.theme_color, '\",\"parent_id\":', childs.parent_id, ',\"pinned\":', childs.pinned, ',\"order\":', childs.\`order\`, ',\"hidden\":', childs.hidden, '}')), ']') as tags
        FROM
          tags parent
        LEFT JOIN tags childs ON parent.id = childs.parent_id
        WHERE parent.user_id = ? AND parent.id = ?
        GROUP BY parent.id;`,
        [user_id, tag_id]
      )

      // クエリ結果のチェック
      if (!Array.isArray(selectQueryResult)) {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      if (selectQueryResult.length == 0) {
        res.status(404).json({ message: "Tag not found" })
        return
      }

      const parsedSelectQueryResult = selectQueryResult.map((row) => {
        row.tags = JSON.parse(row.tags)
        return row
      })

      res.status(200).json(parsedSelectQueryResult[0] as Tag)
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
  } else if (req.method == "PATCH") {
    // Content-Type: "application/json"が指定されているかチェック
    if (
      !req.headers.hasOwnProperty("content-type") ||
      req.headers["content-type"] != "application/json"
    ) {
      res.status(415).json({ message: "Unsupported media type" })
      return
    }

    const updateColumns = Object.keys(req.body)
      .filter((key) =>
        [
          "name",
          "theme_color",
          "parent_id",
          "pinned",
          "order",
          "hidden",
        ].includes(key)
      )
      .map((key) => {
        return { key: key, value: req.body[key] }
      })

    // 更新できないキーが含まれていなかったかチェック
    if (updateColumns.length != Object.keys(req.body).length) {
      res.status(422).json({
        message: `Unprocessable entity (${Object.keys(req.body)
          .filter(
            (key) =>
              ![
                "name",
                "theme_color",
                "parent_id",
                "pinned",
                "order",
                "hidden",
              ].includes(key)
          )
          .join(", ")})`,
      })
      return
    }

    try {
      // クエリ発行
      const updateQueryResult: any = await query(
        `UPDATE tags SET ${updateColumns.map(
          (column) => `${column.key} = ?`
        )} WHERE user_id = ? AND id = ?;`,
        [...updateColumns.map((column) => column.value), user_id, tag_id]
      )

      // クエリ結果のチェック
      if (typeof updateQueryResult != "object") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      if (!updateQueryResult.hasOwnProperty("changedRows")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof updateQueryResult.changedRows != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      if (updateQueryResult.changedRows == 1) {
        res.status(200).json({ message: "Updated" })
      } else {
        res.status(404).json({ message: "Tag not found" })
      }
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
  } else if (req.method == "DELETE") {
    try {
      const deleteQueryResult: any = await query(
        "DELETE FROM tags WHERE user_id = ? AND id = ?",
        [user_id, tag_id]
      )

      // クエリ結果のチェック
      if (!deleteQueryResult.hasOwnProperty("affectedRows")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof deleteQueryResult.affectedRows != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      if (deleteQueryResult.affectedRows == 1) {
        res.status(204).json({ message: "Deleted" })
      } else {
        res.status(404).json({ message: "Tag not found" })
      }
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

//curl -v -X GET -H "Cookie: TOKEN=<token>" localhost/api/tags/<tag_id>
//curl -v -X PATCH -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"name":"new_name"}' localhost/api/tags/<tag_id>
//curl -v -X DELETE -H "Cookie: TOKEN=<token>" localhost/api/tags/<tag_id>
