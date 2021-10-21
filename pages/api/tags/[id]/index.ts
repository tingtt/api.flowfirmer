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
        "SELECT id, name, parent_id, theme_color, pinned, `order`, hidden FROM tags WHERE user_id = ? AND id = ?;",
        [user_id, tag_id]
      )
      // クエリ結果のチェック
      if (!Array.isArray(selectQueryResult)) {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      if (selectQueryResult.length == 0) {
        res.status(403).json({ message: "Tag not found" })
        return
      }
      const embedResult: any = await Promise.all(
        selectQueryResult.map(async (value: any) => {
          // クエリ発行
          const sub_tags: any = await query(
            "SELECT id, name, theme_color, pinned, `order`, hidden FROM tags WHERE user_id = ? AND parent_id = ?;",
            [user_id, value.id]
          )
          // クエリ結果のチェック
          if (!Array.isArray(sub_tags)) {
            throw new Error("Error: Query returned unsupported resopnse")
          }
          if (sub_tags.length != 0) {
            value.sub_tags = sub_tags
          }
          return value
        })
      )
      res.status(200).json(embedResult[0])
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
