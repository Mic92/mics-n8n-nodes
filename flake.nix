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
          lib,
          config,
          ...
        }:
        let
          # Shared npm dependencies — only re-fetched when package-lock.json changes.
          npmDeps = pkgs.importNpmLock {
            npmRoot = ./.;
          };

          mkN8nNode =
            {
              pname,
              description,
              # Extra native build inputs needed during the check phase (e.g.
              # radicale + htpasswd for CalDAV integration tests).
              nativeCheckInputs ? [ ],
              # Jest CLI arguments for the check phase.  Packages with their
              # own globalSetup (like caldav) need --config pointing at a
              # standalone jest config because Jest validates globalSetup
              # paths of ALL projects in the root config — even with
              # --selectProjects — and sibling packages are absent in the
              # nix build sandbox.
              jestArgs ? "--testPathPatterns='packages/${pname}/'",
            }:
            pkgs.buildNpmPackage {
              inherit pname;
              version = "1.0.0";

              # Only include files relevant to this specific package so that
              # changing one node doesn't rebuild all the others.
              src = lib.fileset.toSource {
                root = ./.;
                fileset = lib.fileset.unions [
                  ./tsconfig.base.json
                  ./tsconfig.json
                  ./jest.config.js
                  ./test
                  ./package.json
                  ./package-lock.json
                  (./. + "/packages/${pname}")
                ];
              };

              inherit npmDeps nativeCheckInputs;
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

              doCheck = true;
              checkPhase = ''
                runHook preCheck
                npx jest ${jestArgs}
                runHook postCheck
              '';

              installPhase = ''
                runHook preInstall

                # Prune dev dependencies so transitive deps like isolated-vm
                # (from n8n-workflow -> @n8n/expression-runtime) don't end up
                # in the output.  n8n-workflow is a peerDependency provided by
                # the n8n runtime, so it must not be bundled.
                npm prune --omit=dev --legacy-peer-deps

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
                license = lib.licenses.mit;
              };
            };
          # Simple nodes: description string only.
          simpleNodes = {
            n8n-nodes-nostr = "n8n node to send encrypted DMs via Nostr using NIP-59 Gift Wrap";
            n8n-nodes-opencrow = "n8n node to send trigger messages to OpenCrow";
            n8n-nodes-imap = "n8n node to interact with IMAP mailboxes";
            n8n-nodes-github-notifications = "n8n node to list GitHub notifications";
            n8n-nodes-kagi = "n8n node for Kagi Search and Quick Answer (AI summary)";
          };

          # Nodes that need extra build/test configuration.
          extraNodes = {
            n8n-nodes-caldav = mkN8nNode {
              pname = "n8n-nodes-caldav";
              description = "n8n node for CalDAV integration (Nextcloud, iCloud, Radicale, etc.)";
              jestArgs = "--config packages/n8n-nodes-caldav/jest.config.js";
              nativeCheckInputs = [
                pkgs.radicale
                pkgs.apacheHttpd # htpasswd
              ];
            };
          };
        in
        {
          packages =
            (lib.mapAttrs (pname: description: mkN8nNode { inherit pname description; }) simpleNodes)
            // extraNodes;

          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs
              radicale
              apacheHttpd # provides htpasswd for CalDAV tests
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

          checks = (lib.mapAttrs (_: pkg: pkg) config.packages) // {
            devShell = config.devShells.default;
          };
        };
    };
}
