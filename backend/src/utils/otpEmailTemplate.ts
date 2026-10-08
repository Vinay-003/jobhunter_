export const OTP_EMAIL_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your JobHunter verification code</title>
  <style>
    /* Most email clients understand media queries, but all essentials are inlined below. */
    @media only screen and (max-width: 600px) {
      .email-shell { padding: 22px 12px !important; }
      .email-card { width: 100% !important; }
      .email-padding { padding-left: 25px !important; padding-right: 25px !important; }
      .email-title { font-size: 32px !important; line-height: 39px !important; }
      .otp-code { font-size: 35px !important; letter-spacing: 6px !important; }
      .otp-panel { padding: 24px 10px !important; }
      .header-right { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F5F2EC;color:#1C1814;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Hidden inbox preview; do not put the verification code here. -->
  <div style="display:none;font-size:1px;color:#F5F2EC;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    You're one step away. Verify your sign-in to JobHunter with your one-time code.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F2EC" style="width:100%;background-color:#F5F2EC;border-collapse:collapse;">
    <tr>
      <td class="email-shell" align="center" style="padding:54px 16px 40px;">
        <table class="email-card" role="presentation" cellpadding="0" cellspacing="0" border="0" width="568" style="width:568px;max-width:568px;border-collapse:separate;border-spacing:0;background:#FFFFFF;border:1px solid #E7E0D6;border-radius:18px;overflow:hidden;">
          <tr>
            <td height="5" bgcolor="#302920" style="height:5px;background-color:#302920;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:36px 45px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td valign="middle" style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td valign="middle" width="42" height="42" align="center" bgcolor="#F0EBE3" style="width:42px;height:42px;vertical-align:middle;border-radius:11px;background-color:#F0EBE3;color:#302920;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:42px;font-weight:bold;">
                          ◎
                        </td>
                        <td valign="middle" style="padding-left:12px;vertical-align:middle;font-family:Manrope,'Segoe UI',Arial,sans-serif;font-weight:800;letter-spacing:-0.8px;font-size:22px;line-height:26px;color:#1C1814;">
                          JobHunter
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="header-right" valign="middle" align="right" style="text-align:right;vertical-align:middle;font-family:'DM Sans',Arial,sans-serif;font-weight:bold;letter-spacing:1.6px;font-size:10px;line-height:18px;color:#8B8175;">
                    PRIVATE BY DEFAULT
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:48px 45px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="background-color:#F2EEE8;border:1px solid #E9E0D5;border-radius:50px;padding:6px 11px 5px;color:#6F6357;font-family:'DM Sans','Segoe UI',Arial,sans-serif;font-weight:700;font-size:10px;line-height:14px;letter-spacing:1.4px;">
                    ACCOUNT VERIFICATION
                  </td>
                </tr>
              </table>
              <h1 class="email-title" style="margin:23px 0 13px;color:#1C1814;font-family:Manrope,'Segoe UI',Arial,sans-serif;font-size:40px;line-height:48px;font-weight:800;letter-spacing:-1.7px;">
                You're almost in<span style="color:#998B7B;">.</span>
              </h1>
              <p style="margin:0;color:#5F574F;font-family:'DM Sans','Segoe UI',Arial,sans-serif;font-size:16px;line-height:27px;font-weight:400;">
                One quick security check before you get back to smarter applications. Enter the code below to sign in to JobHunter.
              </p>
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:29px 45px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:separate;background-color:#F8F6F2;border:1px solid #E9E3DA;border-radius:13px;">
                <tr>
                  <td class="otp-panel" align="center" style="text-align:center;padding:29px 18px 27px;">
                    <p style="margin:0 0 15px;color:#83786B;font-family:'DM Sans',Arial,sans-serif;font-size:11px;line-height:15px;letter-spacing:2.2px;font-weight:700;">
                      YOUR ONE-TIME CODE
                    </p>
                    <p class="otp-code" style="margin:0;color:#241C15;font-family:'Courier New',Courier,monospace;font-size:44px;line-height:55px;font-weight:700;letter-spacing:9px;white-space:nowrap;">
                      {{OTP_CODE}}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0;border-collapse:collapse;">
                      <tr>
                        <td style="padding-right:7px;font-family:Arial,sans-serif;font-size:15px;color:#8A7A67;line-height:19px;">◷</td>
                        <td style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:19px;color:#776B5F;font-weight:600;">Expires in 5 minutes</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:29px 45px 36px;">
              <p style="margin:0;color:#766C62;font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:22px;">
                <strong style="color:#463E35;font-weight:700;">A note on security:</strong> JobHunter will never ask you to share this code with anyone. If you didn't request it, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#FBFAF8;border-top:1px solid #EEE8E0;padding:22px 30px;text-align:center;">
              <p style="margin:0;color:#897E72;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.25px;line-height:19px;">
                RESUME HEALTH &nbsp;·&nbsp; EXPLAINABLE INSIGHTS &nbsp;·&nbsp; ROLE MATCHING
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="568" style="width:100%;max-width:568px;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:24px 14px 0;color:#92877A;font-family:'DM Sans','Segoe UI',Arial,sans-serif;font-size:12px;line-height:21px;">
              Sent by <strong style="color:#685C50;font-weight:700;">JobHunter</strong> for your account's security.<br>
              <a href="https://jobhunter.vinaybuilds.me/" target="_blank" style="color:#685C50;text-decoration:underline;text-underline-offset:3px;">jobhunter.vinaybuilds.me</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderOtpEmailHtml(otpCode: string): string {
  const sanitizedCode = escapeHtml(String(otpCode).trim());
  return OTP_EMAIL_TEMPLATE.replace(/{{OTP_CODE}}/g, sanitizedCode);
}
