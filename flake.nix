{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};
        pkg = builtins.fromJSON (builtins.readFile ./package.json);
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [nodejs];
        };

        packages = rec {
          # Static bundle for GitHub Pages. `nix build` also runs the type
          # check, the tests and the bundle size gate, so it is the whole CI.
          gom-jabbar = pkgs.buildNpmPackage {
            pname = pkg.name;
            inherit (pkg) version;
            src = ./.;
            # Dependencies come straight from package-lock.json, one store
            # path per tarball, so there is no hash to refresh.
            npmDeps = pkgs.importNpmLock {npmRoot = ./.;};
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;

            BASE_PATH = "/${pkg.name}/";
            # The sandbox has no git; the flake knows the commit it was built from.
            GIT_REV = self.shortRev or self.dirtyShortRev or "unknown";

            doCheck = true;
            checkPhase = ''
              runHook preCheck
              npm run check
              npm test
              npm run size
              runHook postCheck
            '';

            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          };
          default = gom-jabbar;
        };

        checks.default = self.packages.${system}.default;
      }
    );
}
