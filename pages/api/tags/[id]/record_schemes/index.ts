import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../../../lib/mysql"
import jwt from "jsonwebtoken"

type RecordScheme = {
  id: number
  name: string
  unit_name: string | null
  default_graph_type: "sum" | "flat"
  tag: any
}

type Data =
  | {
      message: string
    }
  | RecordScheme
  | RecordScheme[]

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

  let tag: any

  // tag_idのチェック
  try {
    const selectQueryResult = await query(
      `SELECT * FROM tags WHERE id = ? AND user_id = ?`,
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

    tag = selectQueryResult[0]
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

    // unit_nameを取得
    let unit_name: string | null = req.body.hasOwnProperty("unit_name")
      ? `${req.body.unit_name}`
      : null

    let default_graph_type: "sum" | "flat" = "flat"

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

      default_graph_type = `${req.body.default_graph_type}`.toLowerCase() as
        | "sum"
        | "flat"
    }

    let record_scheme_id: number

    try {
      // クエリ発行
      const insertQueryResult: any = await query(
        "INSERT INTO free_record_schemes (name, unit_name, default_graph_type, tag_id) values (?, ?, ?, ?);",
        [req.body.name, unit_name, default_graph_type, tag_id]
      )

      // insertIdの確認
      if (!insertQueryResult.hasOwnProperty("insertId")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof insertQueryResult.insertId != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      record_scheme_id = insertQueryResult.insertId
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
    res.setHeader(
      "Location",
      `tags/${tag_id}/record_schemes/${record_scheme_id}`
    )

    res.status(201).json({
      id: record_scheme_id,
      name: req.body.name,
      unit_name: unit_name,
      default_graph_type: default_graph_type,
      tag: tag,
    })
  } else {
    res.status(405).json({ message: "Method not allowed" })
  }
}

//curl -v -X POST -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"name":"tag_name", "unit_name":"回", "default_graph_type":"sum"}' localhost/api/tags/[id]/record_schemes
