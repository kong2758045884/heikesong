import { build } from "esbuild";
for (const name of ["model", "qr", "metrics"]) {
  await build({
    entryPoints: ["frontend/" + name + (name === "model" ? ".jsx" : ".js")],
    outfile: "web/assets/" + name + ".js",
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2020",
    legalComments: "eof",
    define: { "process.env.NODE_ENV": '"production"' },
  });
}
