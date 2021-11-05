import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../../../../lib/mysql"
import jwt from "jsonwebtoken"

type RecordScheme = {
  id: number
  name: string
  unit_name: string | null
  default_graph_type: "sum" | "flat"
}

type Data =
  | {
      message: string
    }
  | RecordScheme

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

  const { id, record_scheme_id } = req.query
  const tag_id = +id
  const scheme_id = +record_scheme_id
  if (isNaN(+tag_id) || +tag_id == Infinity) {
    res.status(404).json({ message: "Page not found" })
    return
  }

  // tag_idのチェック
  try {
    const selectQueryResult = await query(
      `SELECT id, name, theme_color, parent_id, pinned, \`order\`, hidden FROM tags WHERE id = ? AND user_id = ?`,
      [tag_id, user_id]
    )

    // クエリ結果のチェック
    if (!Array.isArray(selectQueryResult)) {
      throw new Error("Error: Query returned unsupported resopnse")
    }

    if (selectQueryResult.length != 1) {
      res.status(404).json({ message: "Tag not found" })
      return
    }
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

  if (req.method == "GET") {
    const schemeSelectQueryResult = await query(
      `SELECT * FROM free_record_schemes WHERE id = ? AND tag_id = ?`,
      [scheme_id, tag_id]
    )

    // クエリ結果のチェック
    if (!Array.isArray(schemeSelectQueryResult)) {
      throw new Error("Error: Query returned unsupported resopnse")
    }

    if (schemeSelectQueryResult.length != 1) {
      res.status(404).json({ message: "RecordScheme not found" })
      return
    }

    res.status(200).json(schemeSelectQueryResult[0] as RecordScheme)
    return
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
        ["name", "unit_name", "default_graph_type"].includes(key)
      )
      .map((key) => {
        return { key: key, value: req.body[key] }
      })

    // 更新できないキーが含まれていなかったかチェック
    if (updateColumns.length != Object.keys(req.body).length) {
      res.status(422).json({
        message: `Unprocessable entity (${Object.keys(req.body)
          .filter(
            (key) => !["name", "unit_name", "default_graph_type"].includes(key)
          )
          .join(", ")})`,
      })
      return
    }

    // default_graph_typeのチェック
    if (req.body.hasOwnProperty("default_graph_type")) {
      if (
        `${req.body.default_graph_type}`.toLowerCase() != "sum" &&
        `${req.body.default_graph_type}`.toLowerCase() != "flat"
      ) {
        res
          .status(415)
          .json({ message: "Unprocessable entity (default_graph_type)" })
        return
      }
      if (
        `${req.body.default_graph_type}` != "sum" ||
        `${req.body.default_graph_type}` != "flat"
      ) {
        req.body.default_graph_type =
          `${req.body.default_graph_type}`.toLowerCase()
      }
    }

    try {
      // クエリ発行
      const updateQueryResult: any = await query(
        `UPDATE free_record_schemes SET ${updateColumns.map(
          (column) => `${column.key} = ?`
        )} WHERE id = ? AND tag_id = ?;`,
        [...updateColumns.map((column) => column.value), scheme_id, tag_id]
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
        res.status(404).json({ message: "RecordScheme not found" })
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
        "DELETE FROM free_record_schemes WHERE id = ? AND tag_id = ?",
        [scheme_id, tag_id]
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
        res.status(404).json({ message: "RecordScheme not found" })
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

//curl -v -X GET -H "Cookie: TOKEN=<token>" localhost/api/tags/<tag_id>/record_schemes/<record_scheme_id>
//curl -v -X PATCH -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"name":"new_name","unit_name","分","default_graph_type":"flat"}' localhost/api/tags/<tag_id>/record_schemes/<record_scheme_id>
//curl -v -X DELETE -H "Cookie: TOKEN=<token>" localhost/api/tags/<tag_id>/record_schemes/<record_scheme_id>
