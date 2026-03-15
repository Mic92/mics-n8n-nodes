# Mic's n8n Community Nodes

Custom [n8n](https://n8n.io/) community nodes. Each package can be installed
independently.

## Nodes

- [**CalDAV**](packages/n8n-nodes-caldav/) — manage calendars, events, and todos on any CalDAV server (Nextcloud, iCloud, Radicale, …) with a polling trigger
- [**GitHub Notifications**](packages/n8n-nodes-github-notifications/) — list notifications from GitHub with pagination support
- [**IMAP**](packages/n8n-nodes-imap/) — append, move, and list messages in IMAP mailboxes (zero dependencies)
- [**Kagi**](packages/n8n-nodes-kagi/) — web search and AI-powered Quick Answer summaries via Kagi
- [**Nostr**](packages/n8n-nodes-nostr/) — send encrypted DMs (NIP-59) and publish profile metadata
- [**OpenCrow**](packages/n8n-nodes-opencrow/) — send trigger messages via named pipe

## Installation

### NixOS module (recommended)

Add the flake input and import the NixOS module, then enable the nodes
you want:

```nix
# flake.nix
inputs.mics-n8n-nodes.url = "github:Mic92/mics-n8n-nodes";

# In your NixOS configuration:
{
  imports = [ mics-n8n-nodes.nixosModules.default ];

  services.n8n.enable = true;

  # Enable all nodes at once:
  # mics-n8n-nodes.enableAll = true;

  # Or pick individual nodes:
  mics-n8n-nodes.nodes = {
    n8n-nodes-caldav.enable = true;
    n8n-nodes-kagi.enable = true;
    # n8n-nodes-imap.enable = true;
    # n8n-nodes-nostr.enable = true;
    # n8n-nodes-opencrow.enable = true;
    # n8n-nodes-github-notifications.enable = true;
  };
}
```

The module symlinks each enabled node's `dist/` into n8n's custom
extensions directory (`/var/lib/n8n/.n8n/custom/`) via a systemd
`preStart` hook.

Build a single node without the module:

```bash
nix build github:Mic92/mics-n8n-nodes#n8n-nodes-caldav
nix build github:Mic92/mics-n8n-nodes#n8n-nodes-imap
# etc.
```

### Manual

Clone the repo, build the node you want, and copy its `dist/` directory into
n8n's [custom extensions folder](https://docs.n8n.io/integrations/creating-nodes/test/run-node-locally/)
(`~/.n8n/custom/`):

```bash
git clone https://github.com/Mic92/mics-n8n-nodes.git
cd mics-n8n-nodes
npm install --legacy-peer-deps
npm run build --workspace=packages/n8n-nodes-caldav

# Copy into n8n custom nodes directory
mkdir -p ~/.n8n/custom/n8n-nodes-caldav
cp -r packages/n8n-nodes-caldav/dist packages/n8n-nodes-caldav/package.json \
  ~/.n8n/custom/n8n-nodes-caldav/
```

Then restart n8n.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, building, and how to
add new nodes.

## License

MIT
