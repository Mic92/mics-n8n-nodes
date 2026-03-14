{
  description = "Mic's custom n8n community nodes";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      flake-parts,
      treefmt-nix,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        treefmt-nix.flakeModule
      ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];

      perSystem =
        {
          pkgs,
          config,
          ...
        }:
        let
          mkN8nNode =
            {
              pname,
              description,
            }:
            pkgs.buildNpmPackage {
              inherit pname;
              version = "1.0.0";

              src = ./.;

              npmDeps = pkgs.importNpmLock {
                npmRoot = ./.;
              };
              npmConfigHook = pkgs.importNpmLock.npmConfigHook;

              makeCacheWritable = true;
              npmFlags = [
                "--ignore-scripts"
                "--legacy-peer-deps"
              ];

              buildPhase = ''
                runHook preBuild
                npm run build --workspace=packages/${pname}
                runHook postBuild
              '';

              installPhase = ''
                runHook preInstall
                mkdir -p $out/lib/node_modules/${pname}
                cp -r packages/${pname}/dist packages/${pname}/package.json node_modules $out/lib/node_modules/${pname}/

                # npm workspaces create symlinks to sibling packages; remove
                # them so the output doesn't contain dangling references.
                find $out/lib/node_modules/${pname}/node_modules \
                  -maxdepth 1 -type l -xtype l -delete

                runHook postInstall
              '';

              meta = {
                inherit description;
                license = pkgs.lib.licenses.mit;
              };
            };
        in
        {
          packages = {
            n8n-nodes-nostr = mkN8nNode {
              pname = "n8n-nodes-nostr";
              description = "n8n node to send encrypted DMs via Nostr using NIP-59 Gift Wrap";
            };

            n8n-nodes-opencrow = mkN8nNode {
              pname = "n8n-nodes-opencrow";
              description = "n8n node to send trigger messages to OpenCrow";
            };

            n8n-nodes-imap = mkN8nNode {
              pname = "n8n-nodes-imap";
              description = "n8n node to interact with IMAP mailboxes";
            };

            n8n-nodes-github-notifications = mkN8nNode {
              pname = "n8n-nodes-github-notifications";
              description = "n8n node to list GitHub notifications";
            };
          };

          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs
            ];

            shellHook = ''
              echo "Mic's n8n Nodes Development Environment"
            '';
          };

          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              nixfmt.enable = true;
              prettier.enable = true;
            };
            settings.formatter = {
              prettier = {
                excludes = [
                  "package-lock.json"
                  "flake.lock"
                ];
              };
            };
          };

          checks = {
            n8n-nodes-nostr = config.packages.n8n-nodes-nostr;
            n8n-nodes-opencrow = config.packages.n8n-nodes-opencrow;
            n8n-nodes-imap = config.packages.n8n-nodes-imap;
            n8n-nodes-github-notifications = config.packages.n8n-nodes-github-notifications;
            devShell = config.devShells.default;
          };
        };
    };
}
