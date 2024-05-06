import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: Bun.env.nodemailerHost,
  port: 465,
  secure: true,
  auth: {
    user: Bun.env.user,
    pass: Bun.env.passwd,
  },
});

async function senMessage(email: string, address: string) {
  // send mail
  const info = await transporter.sendMail({
    from: `"Have a good day 👻" ${Bun.env.user}`,
    to: email,
    subject: "verify your login",
    html: getHtml(address),
  });
}

const getHtml = (url: string) => `
<p>If it cannot be redirected, copy the URL below and access it in the browser</p>
<p>${url}</p>

<a target ='_blank'  href=${url}>Click to verify</a>
`

export default senMessage
