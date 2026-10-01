import nextBase from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";
import nextCwv from "eslint-config-next/core-web-vitals";

const ignores = {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "public/imgly/**",
    "public/fixtures/**",
    "next-env.d.ts",
    "scripts/**",
  ],
};

const config = [
  ignores,
  ...nextBase,
  ...nextTs,
  ...nextCwv,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
