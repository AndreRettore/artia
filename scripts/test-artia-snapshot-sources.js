const assert = require("node:assert/strict");
const { dedupeRows } = require("../lib/artia-snapshot-sources");

const rows = [
  {
    project: "1447",
    projectLabel: "PRINER x BEMISA",
    activity: "1.1 - Organizacao de Documentos",
    id: "32875326"
  },
  {
    project: "1447",
    projectLabel: "PRINER x BEMISA",
    activity: "1.1 - Organizacao de Documentos",
    id: "32888030"
  },
  {
    project: "1447",
    projectLabel: "PRINER x BEMISA",
    activity: "1.2 - Anexos",
    id: "32888031"
  }
];

const deduped = dedupeRows(rows);
const activity = deduped.find((row) => row.activity === "1.1 - Organizacao de Documentos");

assert.equal(deduped.length, 2);
assert.equal(activity?.id, "32888030");

console.log("artia snapshot source tests passed");
