import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../lib/mysql"
import { compare } from "bcrypt"
import jwt from "jsonwebtoken"

type Data = {
  message: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method == "POST") {
    // Create user

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
      !req.body.hasOwnProperty("email") ||
      !req.body.hasOwnProperty("password")
    ) {
      res.status(400).json({ message: "Invalid request" })
      return
    }

    let user_id: number
    let password: string

    try {
      // クエリ発行
      const result = await query(
        `SELECT id, password FROM users WHERE email = ?;`,
        [req.body.email]
      )

      // emailが一致するユーザーが登録されていない
      if (result.length != 1) {
        res.status(401).json({ message: "Invalid password or email." })
        return
      }

      user_id = result[0].number
      password = result[0].password

      // privateKeyの確認
      if (typeof process.env.JWT_SECRET != "string") {
        throw new Error("Error: JWT secret does not exits")
      }
    } catch (e) {
      let msg = ""
      if (e instanceof Error) {
        msg = e.message
      } else {
        msg = "Error: Query execution failed"
      }
      res.status(500).json({ message: msg })
      return
    }

    // パスワード比較
    const compareResult = await compare(req.body.password, password)
    if (!compareResult) {
      res.status(401).json({ message: "Invalid password or email." })
      return
    }

    // JWTの生成
    const token = jwt.sign({ user_id: user_id }, process.env.JWT_SECRET, {
      issuer: "flow firmer",
      expiresIn: "7 days",
    })

    // JWTを渡す
    res.setHeader("Set-Cookie", `TOKEN=${token}; Path=/; HttpOnly`)

    res.status(200).json({ message: "Success" })
  } else {
    res.status(405).json({ message: "Method not allowed" })
  }
}

//curl -v -X POST -H "Content-Type: application/json" -d '{"email":"flowfirmer@example.com","password":"flowfirmer"}' localhost/api/login
