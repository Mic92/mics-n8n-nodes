import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class ImapApi implements ICredentialType {
  name = "imapApi";
  displayName = "IMAP";
  properties: INodeProperties[] = [
    {
      displayName: "Host",
      name: "host",
      type: "string",
      default: "",
      required: true,
      description: "IMAP server hostname",
    },
    {
      displayName: "Port",
      name: "port",
      type: "number",
      default: 993,
      required: true,
      description: "IMAP port (993 for implicit TLS, 143 for STARTTLS)",
    },
    {
      displayName: "User",
      name: "user",
      type: "string",
      default: "",
      required: true,
      description: "IMAP login username",
    },
    {
      displayName: "Password",
      name: "password",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "IMAP login password",
    },
    {
      displayName: "TLS",
      name: "tls",
      type: "boolean",
      default: true,
      description:
        "Whether to use implicit TLS (port 993). If false, connects plain then upgrades via STARTTLS.",
    },
    {
      displayName: "Reject Unauthorized",
      name: "rejectUnauthorized",
      type: "boolean",
      default: true,
      description: "Whether to verify the server TLS certificate",
    },
  ];
}
