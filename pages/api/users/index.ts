import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../lib/mysql"
import { hash } from "bcrypt"
import jwt from "jsonwebtoken"

type Data = {
  message: string
  user_name?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
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
    if (
      !req.body.hasOwnProperty("name") ||
      !req.body.hasOwnProperty("email") ||
      !req.body.hasOwnProperty("password")
    ) {
      res.status(400).json({ message: "Invalid request" })
      return
    }

    let user_id: number

    try {
      // emailが未使用か確認
      const queryResult = await query(
        `SELECT password FROM users WHERE email = ?`,
        [req.body.email]
      )
      if (Array.isArray(queryResult) && queryResult.length != 0) {
        res.status(422).json({ message: "Email address already registered." })
        return
      }

      // ハッシュ生成
      const hashedPassword = await hash(req.body.password, 10)

      // クエリ発行
      const insertQueryResult: any = await query(
        `INSERT INTO users (name, email, password) values (?, ?, ?);`,
        [req.body.name, req.body.email, hashedPassword]
      )

      // insertIdの確認
      if (!insertQueryResult.hasOwnProperty("insertId")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof insertQueryResult.insertId != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      user_id = insertQueryResult.insertId

      // privateKeyの確認
      if (typeof process.env.JWT_SECRET != "string") {
        throw new Error("Error: JWT secret does not exits")
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

    // JWTの生成
    const token = jwt.sign({ user_id: user_id }, process.env.JWT_SECRET, {
      issuer: "flow firmer",
      expiresIn: "7 days",
    })

    // JWTを渡す
    res.setHeader("Set-Cookie", `TOKEN=${token}; Path=/; HttpOnly`)

    // 登録情報取得用のエンドポイント
    res.setHeader("Location", `/${user_id}`)

    res.status(201).json({ message: "Success", user_name: req.body.name })
  } else {
    res.status(405).json({ message: "Method not allowed" })
  }
}

//curl -v -X POST -H "Content-Type: application/json" -d '{"name":"flowfirmer","email":"flowfirmer@example.com","password":"flowfirmer"}' localhost/api/users
