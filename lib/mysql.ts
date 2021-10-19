import mysql from "mysql2/promise"

export const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
})

export async function query(
  q: string,
  values: (string | number)[] | string | number = []
) {
  try {
    const [results] = await (await db).execute(q, values)
    return results
  } catch (e) {
    if (e instanceof Error) {
      throw Error(e.message)
    }
    throw new Error("Error: Query execution failed.")
  }
}

/**
 * Usage
 */

// async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse<Data>
// ) {
//   if (req.method == "GET") {
//     try {
//       const result = await query(`SELECT * FEOM todos`)
//       res.status(200).json(result)
//     } catch (e) {
//       let msg = ""
//       if (e instanceof Error) {
//         msg = e.message
//       } else {
//         msg = "Error: Query execution failed."
//       }
//       res.status(500).json({ message: msg })
//     }
//   } else {
//     res.status(405).json({ message: "Method Not Allowed" })
//   }
// }
