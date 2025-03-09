# SPDX-FileCopyrightText: 2021-2025 Akira Komamura
# SPDX-License-Identifier: Unlicense
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      eachSystem =
        f:
        nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed (system: f nixpkgs.legacyPackages.${system});
        fetch-data = pkgs: pkgs.writeScriptBin "fetch-data" ''
          #!${pkgs.bash}/bin/bash
          
          BASEDIR=$(pwd)
          mkdir -p $BASEDIR/infinite-lunch/src
          ${pkgs.curl}/bin/curl -o $BASEDIR/infinite-lunch/src/cities15000.zip http://download.geonames.org/export/dump/cities15000.zip
          ${pkgs.unzip}/bin/unzip -o $BASEDIR/infinite-lunch/src/cities15000.zip -d $BASEDIR/infinite-lunch/src
          ${pkgs.gawk}/bin/awk '
          BEGIN {
        FS = "\t"
          }
          
          {
          city["name"] = $3
          city["latitude"] = $5
          city["longitude"] = $6
          city["timezone"] = $18
          city["country_code"] = $9
          city["population"] = $15
          printf "{\"name\": \"%s\", \"latitude\": %f, \"longitude\": %f, \"timezone\": \"%s\", \"country_code\": \"%s\", \"population\": %s}\n",
            city["name"], city["latitude"], city["longitude"], city["timezone"], city["country_code"], city["population"]
         }
          ' $BASEDIR/infinite-lunch/src/cities15000.txt | ${pkgs.jq}/bin/jq -s -c > $BASEDIR/infinite-lunch/src/cities100_000.json
          
          rm $BASEDIR/infinite-lunch/src/cities15000.zip
          rm $BASEDIR/infinite-lunch/src/cities15000.txt
        '';
    in
    {
      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
	    pkgs.nodejs
	    pkgs.corepack
      (fetch-data pkgs)
          ];
        };
      });
    };
}
