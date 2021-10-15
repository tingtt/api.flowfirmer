import type { NextApiRequest, NextApiResponse } from "next"

type Data = {
  message: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  switch (req.method) {
    case "POST":
      res.setHeader("Set-Cookie", "TOKEN=abc; Path=/; HttpOnly")
      res.status(200).json({ message: "Success" })
      break

    default:
      res.status(405).json({ message: "Method Not Allowed" })
      break
  }
}
