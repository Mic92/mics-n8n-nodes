import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";

export class KagiApi implements ICredentialType {
  name = "kagiApi";
  displayName = "Kagi API";
  documentationUrl =
    "https://help.kagi.com/kagi/privacy/private-browser-sessions.html";
  icon: Icon = "file:kagi.svg";
  properties: INodeProperties[] = [
    {
      displayName: "Session Token",
      name: "sessionToken",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      placeholder: "aBcDe123xyz.a1b2c3d4e5f6g7h8i9j0kLmNoPqRsTuVwXyZ",
      description:
        'Your Kagi Session Link or token. Go to <a href="https://kagi.com/settings?p=user_details">Settings → Account → Session Link</a> and paste the full URL or just the token value (the part after "?token=").',
    },
  ];
}
