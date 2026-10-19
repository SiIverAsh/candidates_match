import fs from "node:fs/promises";
import path from "node:path";

import {
  SpreadsheetFile,
  Workbook,
} from "file:///C:/Users/12273/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const projectRoot = path.resolve(process.cwd(), "..");
const outputDir = path.join(
  projectRoot,
  "outputs",
  "01a09dc5-5751-79b2-a85c-f744755ed2f4",
);
const appTemplateDir = path.join(process.cwd(), "assets", "templates");
const outputPath = path.join(outputDir, "employee_import_template.xlsx");
const appTemplatePath = path.join(appTemplateDir, "employee_import_template.xlsx");

const workbook = Workbook.create();
const fontFamily = "Arial";
const headerFill = "#102A43";
const inputFill = "#FFF7D6";
const borderColor = "#D9E2EC";

function buildSheet({ name, headers, example, widths, dateColumns = [] }) {
  const sheet = workbook.worksheets.add(name);
  const endColumn = String.fromCharCode(64 + headers.length);

  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(1);
  sheet.getRange(`A1:${endColumn}2`).values = [headers, example];
  sheet.getRange(`A1:${endColumn}2`).format.font = {
    name: fontFamily,
    size: 10,
  };
  sheet.getRange(`A1:${endColumn}1`).format = {
    fill: headerFill,
    font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 26,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  sheet.getRange(`A2:${endColumn}2`).format = {
    fill: inputFill,
    verticalAlignment: "center",
    rowHeight: 24,
    borders: { preset: "outside", style: "thin", color: borderColor },
  };
  sheet.getRange(`A1:${endColumn}2`).format.wrapText = false;

  for (let index = 0; index < widths.length; index += 1) {
    const column = String.fromCharCode(65 + index);
    sheet.getRange(`${column}:${column}`).format.columnWidth = widths[index];
  }
  for (const column of dateColumns) {
    sheet.getRange(`${column}2:${column}1000`).format.numberFormat = "yyyy-mm-dd";
  }
  return sheet;
}

buildSheet({
  name: "Employees",
  headers: [
    "employee_id",
    "name",
    "email",
    "current_department",
    "current_title",
  ],
  example: ["E0001", "周予安（虚构）", "test.employee1@example.com", "免疫研究部", "免疫学研究员"],
  widths: [16, 22, 34, 20, 20],
});

buildSheet({
  name: "WorkExperience",
  headers: ["employee_id", "company", "title", "start_date", "end_date"],
  example: ["E0001", "明澈免疫生物医药有限公司", "免疫学研究员", new Date("2020-01-01"), null],
  widths: [16, 40, 22, 16, 16],
  dateColumns: ["D", "E"],
});

buildSheet({
  name: "Education",
  headers: ["employee_id", "school", "major", "start_date", "end_date"],
  example: [
    "E0001",
    "北京大学",
    "免疫学",
    new Date("2016-09-01"),
    new Date("2020-06-30"),
  ],
  widths: [16, 24, 22, 16, 16],
  dateColumns: ["D", "E"],
});

workbook.recalculate();

const overview = await workbook.inspect({
  kind: "workbook,sheet",
  maxChars: 6000,
  tableMaxRows: 4,
  tableMaxCols: 6,
});
console.log(overview.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(appTemplateDir, { recursive: true });

for (const sheetName of ["Employees", "WorkExperience", "Education"]) {
  const preview = await workbook.render({
    sheetName,
    range: "A1:E2",
    scale: 2,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
await fs.copyFile(outputPath, appTemplatePath);
console.log(JSON.stringify({ outputPath, appTemplatePath }));
