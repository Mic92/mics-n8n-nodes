import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";

export class NostrApi implements ICredentialType {
  name = "nostrApi";
  displayName = "Nostr";
  icon: Icon = "file:../nodes/Nostr/nostr.svg";
  properties: INodeProperties[] = [
    {
      displayName: "Private Key (nsec or hex)",
      name: "privateKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "Your Nostr private key in nsec1… bech32 or 64-char hex format",
    },
    {
      displayName: "Relays",
      name: "relays",
      type: "string",
      default: "wss://relay.damus.io, wss://relay.primal.net, wss://nos.lol",
      required: true,
      description: "Comma-separated list of relay WebSocket URLs to publish to",
    },
  ];
}
