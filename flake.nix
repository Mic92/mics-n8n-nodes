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
        {
          packages.default = pkgs.buildNpmPackage {
            pname = "mics-n8n-nodes";
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
              npm run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out/lib/node_modules/mics-n8n-nodes
              cp -r dist package.json node_modules $out/lib/node_modules/mics-n8n-nodes/
              runHook postInstall
            '';

            meta = {
              description = "Mic's custom n8n community nodes";
              license = pkgs.lib.licenses.mit;
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
            package = config.packages.default;
            devShell = config.devShells.default;
          };
        };
    };
}
