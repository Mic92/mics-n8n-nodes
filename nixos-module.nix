{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.mics-n8n-nodes;

  # All available node packages from this flake.
  allNodePackages = self.packages.${pkgs.stdenv.hostPlatform.system};

  # Build the set of enabled packages.
  enabledPackages = lib.filterAttrs (name: _: cfg.nodes.${name}.enable) allNodePackages;
in
{
  options.mics-n8n-nodes = {
    enableAll = lib.mkEnableOption "all community nodes for n8n";

    nodes = lib.mapAttrs (name: _: {
      enable = lib.mkEnableOption "the ${name} community node for n8n";
    }) allNodePackages;

    extraNodes = lib.mkOption {
      type = lib.types.attrsOf lib.types.path;
      default = { };
      description = ''
        Additional n8n community node packages to install.
        Each attribute name is used as the directory name under
        /var/lib/n8n/.n8n/custom/, and the value is the path to the
        dist directory to symlink.
      '';
      example = lib.literalExpression ''
        {
          n8n-nodes-paperless =
            "''${pkgs.n8n-nodes-paperless}/lib/node_modules/@n8n-chezmoi-sh/n8n-nodes-paperless/dist";
        }
      '';
    };
  };

  config = lib.mkMerge [
    (lib.mkIf cfg.enableAll {
      mics-n8n-nodes.nodes = lib.mapAttrs (_: _: { enable = true; }) allNodePackages;
    })

    (lib.mkIf (enabledPackages != { } || cfg.extraNodes != { }) {
      systemd.services.n8n.preStart = lib.mkAfter ''
        mkdir -p /var/lib/n8n/.n8n/custom
        ${lib.concatStringsSep "\n" (
          lib.mapAttrsToList (
            name: pkg: "ln -sfn ${pkg}/lib/node_modules/${name}/dist /var/lib/n8n/.n8n/custom/${name}"
          ) enabledPackages
        )}
        ${lib.concatStringsSep "\n" (
          lib.mapAttrsToList (name: path: "ln -sfn ${path} /var/lib/n8n/.n8n/custom/${name}") cfg.extraNodes
        )}
      '';
    })
  ];
}
