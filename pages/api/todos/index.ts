import type { NextApiRequest, NextApiResponse } from "next"
import { query } from "../../../lib/mysql"
import jwt from "jsonwebtoken"

type Todo = {
  id: number
  name: string
  description: string | null
  date: string | null
  time: string | null
  execution_time: number | null
  tags: Array<any>
  term?: any
  repeat_todo_model?: any
}

type Data =
  | {
      message: string
    }
  | Todo
  | Todo[]

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

    // description
    const description =
      typeof req.body.description != "undefined"
        ? String(req.body.description)
        : null

    let date: Date | null = null

    // dateのチェック
    if (req.body.hasOwnProperty("date")) {
      // '2000-01-01' - '9999-12-31' || '01-01' - '12-31'
      if (
        typeof req.body.date != "string" ||
        !/^([2-9][0-9]{3}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])|(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1]))$/.test(
          req.body.date
        )
      ) {
        res.status(415).json({ message: "Unprocessable entity (date)" })
        return
      }

      date = new Date(
        /^[2-9][0-9]{3}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])$/.test(
          req.body.date
        )
          ? req.body.date
          : new Date().getFullYear().toString().concat("-", req.body.date)
      )
      if (date.toString() == "Invalid Date") {
        res.status(415).json({ message: "Unprocessable entity (date)" })
        return
      }
    }

    // date文字列の生成
    let date_str: string | null = null
    if (date != null) {
      date_str = "".concat(
        date.getFullYear().toString(),
        "-",
        date.getMonth().toString().padStart(2, "0"),
        "-",
        date.getDate().toString().padStart(2, "0")
      )
    }

    let time_str: string | null = null

    // timeのチェック
    if (req.body.hasOwnProperty("time")) {
      // '00:00' - '23:56'
      if (
        typeof req.body.time != "string" ||
        !/^(([0-1][0-9]|2[0-3]):[0-5][0-9])$/.test(req.body.time)
      ) {
        res.status(415).json({ message: "Unprocessable entity (time)" })
        return
      }
      // time文字列の生成
      time_str = req.body.time
    }

    // execution_time
    let execution_time: number | null = null

    // execution_timeのチェック
    if (req.body.hasOwnProperty("execution_time")) {
      if (
        typeof req.body.execution_time != "number" &&
        (isNaN(+req.body.execution_time) ||
          +req.body.execution_time == Infinity)
      ) {
        res
          .status(415)
          .json({ message: "Unprocessable entity (execution_time)" })
        return
      }
      execution_time = +req.body.execution_time
    }

    let term_id: number | null = null

    // term_idのチェック
    if (req.body.hasOwnProperty("term_id")) {
      if (
        typeof req.body.term_id != "number" &&
        (isNaN(+req.body.term_id) || +req.body.term_id == Infinity)
      ) {
        res.status(415).json({ message: "Unprocessable entity (term_id)" })
        return
      }
      term_id = +req.body.term_id
    }

    // tag_idsのチェック
    if (req.body.tag_ids != undefined && !Array.isArray(req.body.tag_ids)) {
      res.status(415).json({ message: "Unprocessable entity (tag_ids)" })
      return
    }

    let tag_ids: number[] = Array.isArray(req.body.tag_ids)
      ? (req.body.tag_ids as Array<any>)
          .map((value: any) => +value)
          .filter((value) => !isNaN(value) && value != Infinity)
      : []

    let todo_id: number

    try {
      let term: any = null

      // termの取得
      if (term_id != null) {
        // クエリ発行 `terms`
        const queryResult = await query(
          `SELECT id, name, description, date_format(start, '%Y-%m-%d') start, date_format(end, '%Y-%m-%d') end, parent_id FROM terms WHERE user_id = ? AND id = ?`,
          [user_id, term_id]
        )
        if (!Array.isArray(queryResult)) {
          throw new Error("Error: Query returned unsupported response")
        }
        if (queryResult.length != 1) {
          res.status(404).json({
            message: `Term not found (id: ${term_id})`,
          })
          return
        }
        if (typeof queryResult[0] != "object") {
          throw new Error("Error: Query returned unsupported response")
        }
        term = queryResult.pop()
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

      // クエリ発行 `todos`
      const todoInsertQueryResult: any = await query(
        `INSERT INTO todos
          (user_id, name, description, date, time, execution_time)
        VALUES (?, ?, ?, ?, ?, ?);`,
        [
          user_id,
          req.body.name,
          description,
          date_str,
          time_str,
          execution_time,
        ]
      )

      // insertIdの確認
      if (typeof todoInsertQueryResult != "object") {
        throw new Error("Error: Query returned unsupported resopnse")
      }
      if (!todoInsertQueryResult.hasOwnProperty("insertId")) {
        throw new Error("Error: Query execution failed.")
      }
      if (typeof todoInsertQueryResult.insertId != "number") {
        throw new Error("Error: Query returned unsupported resopnse")
      }

      todo_id = todoInsertQueryResult.insertId

      // tagとのmap（紐付け情報）の登録
      if (tags.length > 0) {
        // クエリ発行 `todo_tag_maps`
        query(
          `INSERT INTO todo_tag_maps (todo_id, tag_id) VALUES ${tags
            .map((_) => "(?, ?)")
            .join(",")}`,
          tags.map((tag: any) => +tag.id).flatMap((id) => [todo_id, id])
        ).then((result: any) => {
          if (
            typeof result != "object" ||
            !result.hasOwnProperty("insertId") ||
            typeof result.insertId != "number"
          ) {
            console.log(
              `Error: Query failed to insert into \`todo_tag_maps\`.)`
            )
          }
        })
        // TODO: mapの登録失敗時のDELETE処理
      }

      // 登録情報取得用のエンドポイント
      res.setHeader("Location", `todos/${todo_id}`)

      res.status(201).json(
        term != null
          ? {
              id: todo_id,
              name: req.body.name,
              description: description,
              date: date_str,
              time: time_str,
              execution_time: execution_time,
              tags: tags,
              term: term,
            }
          : {
              id: todo_id,
              name: req.body.name,
              description: description,
              date: date_str,
              time: time_str,
              execution_time: execution_time,
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
  } else {
    res.status(405).json({ message: "Method not allowed" })
  }
}

//curl -v -X POST -H "Content-Type: application/json" -H "Cookie: TOKEN=<token>" -d '{"name":"todo1"}' localhost/api/todos
