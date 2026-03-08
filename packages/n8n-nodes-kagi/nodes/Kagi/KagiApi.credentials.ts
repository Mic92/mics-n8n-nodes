import type {
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class KagiApi implements ICredentialType {
  name = "kagiApi";
  displayName = "Kagi API";
  documentationUrl = "https://kagi.com/settings?p=api";
  properties: INodeProperties[] = [
    {
      displayName: "Session Token",
      name: "sessionToken",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "Kagi session token. Go to Settings → Session Link to generate one.",
    },
  ];
}
