import { company, invoiceFull, fmtDay, monthEn } from "./ops";

async function printer() {
  const PdfPrinter = (await import("pdfmake")).default as any;
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  const vfs = vfsMod.pdfMake?.vfs || vfsMod.default?.pdfMake?.vfs || vfsMod.default || vfsMod;
  const f = (n: string) => Buffer.from(vfs[n], "base64");
  return new PdfPrinter({ Roboto: { normal: f("Roboto-Regular.ttf"), bold: f("Roboto-Medium.ttf"), italics: f("Roboto-Italic.ttf"), bolditalics: f("Roboto-MediumItalic.ttf") } });
}

function render(doc: any): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const p = await printer();
      const pdf = p.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdf.on("data", (c: Buffer) => chunks.push(c));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}

const fmt = (n: unknown, cur: string) => {
  const v = (Number(n) || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === "EUR" ? `€ ${v}` : cur === "USD" ? `$ ${v}` : `${v} ${cur}`;
};
const INK = "#14202B";
const GREY = "#66737F";

/** Счёт клиенту на английском — клиенты Heliclub международные. */
export async function invoicePdf(id: string) {
  const inv = await invoiceFull(id);
  if (!inv) throw new Error("Нет такого счёта");
  const co = await company();
  const cur = inv.currency || "EUR";
  const kindLabel: Record<string, string> = { storage: "Hangarage", flight: "Flight", maintenance: "Maintenance", other: "Service" };
  const body = [
    [
      { text: "Date", style: "th" },
      { text: "Description", style: "th" },
      { text: "Qty", style: "th", alignment: "right" },
      { text: "Rate", style: "th", alignment: "right" },
      { text: "Amount", style: "th", alignment: "right" },
    ],
    ...inv.lines.map((l: any) => [
      fmtDay(l.day),
      { stack: [{ text: kindLabel[l.kind] || "Service", bold: true }, { text: l.title, color: GREY, fontSize: 8 }] },
      { text: String(Number(l.qty)), alignment: "right" },
      { text: fmt(l.unit_price, cur), alignment: "right" },
      { text: fmt(l.amount, cur), alignment: "right" },
    ]),
  ];
  const doc = {
    pageMargins: [48, 56, 48, 64],
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.25 },
    styles: { th: { bold: true, fontSize: 8, color: GREY, margin: [0, 0, 0, 4] } },
    footer: (page: number, pages: number) => ({ text: [co.footer || co.name || "", pages > 1 ? `   ${page}/${pages}` : ""].join(""), alignment: "center", fontSize: 7.5, color: GREY, margin: [0, 24, 0, 0] }),
    content: [
      {
        columns: [
          { stack: [{ text: co.name || "Heliclub", fontSize: 16, bold: true }, { text: co.address || "", color: GREY, margin: [0, 4, 0, 0] }, co.vat ? { text: `VAT ${co.vat}`, color: GREY } : ""] },
          { stack: [{ text: "INVOICE", fontSize: 20, bold: true, alignment: "right", characterSpacing: 2 }, { text: `No. ${inv.number}`, alignment: "right", margin: [0, 4, 0, 0] }], width: 180 },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.6, lineColor: "#C9D1D8" }], margin: [0, 18, 0, 14] },
      {
        columns: [
          { stack: [{ text: "Bill to", style: "th" }, { text: inv.client_name, bold: true }, inv.contact ? { text: inv.contact } : "", inv.client_email ? { text: inv.client_email, color: GREY } : ""] },
          {
            width: 200,
            table: {
              widths: ["*", "auto"],
              body: [
                [{ text: "Issue date", color: GREY }, { text: fmtDay(inv.issued), alignment: "right" }],
                [{ text: "Due date", color: GREY }, { text: fmtDay(inv.due), alignment: "right" }],
                [{ text: "Period", color: GREY }, { text: inv.period ? monthEn(inv.period) : "", alignment: "right" }],
                ...(inv.aircraft ? [[{ text: "Aircraft", color: GREY }, { text: inv.aircraft, alignment: "right" }]] : []),
              ],
            },
            layout: "noBorders",
          },
        ],
      },
      {
        margin: [0, 22, 0, 0],
        table: { headerRows: 1, widths: [52, "*", 34, 64, 70], body },
        layout: { hLineWidth: (i: number) => (i === 1 ? 0.8 : 0.3), vLineWidth: () => 0, hLineColor: () => "#C9D1D8", paddingTop: () => 6, paddingBottom: () => 6 },
      },
      {
        margin: [0, 10, 0, 0],
        columns: [{ text: "" }, { width: 200, table: { widths: ["*", "auto"], body: [[{ text: "Total due", bold: true, fontSize: 11 }, { text: fmt(inv.total, cur), bold: true, fontSize: 11, alignment: "right" }]] }, layout: "noBorders" }],
      },
      co.iban
        ? {
            margin: [0, 28, 0, 0],
            stack: [
              { text: "Payment details", style: "th" },
              { text: [co.bank ? co.bank + "   " : "", `IBAN ${co.iban}`, co.bic ? `   BIC ${co.bic}` : ""].join("") },
              { text: `Reference: ${inv.number}`, color: GREY },
            ],
          }
        : "",
      inv.note ? { text: inv.note, margin: [0, 16, 0, 0], color: GREY } : "",
    ],
  };
  return { buf: await render(doc), name: `Invoice ${inv.number} ${inv.client_name}.pdf` };
}

/** Договор или любой текст в PDF (простая разметка: заголовки #, абзацы, списки -). */
export async function textPdf(title: string, markdown: string) {
  const content: any[] = [{ text: title, fontSize: 15, bold: true, margin: [0, 0, 0, 12] }];
  let list: any[] | null = null;
  const flush = () => {
    if (list) content.push({ ul: list, margin: [0, 0, 0, 8] });
    list = null;
  };
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const l = raw.trimEnd();
    if (!l.trim()) {
      flush();
      continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      content.push({ text: h[2].replace(/\*\*/g, ""), bold: true, fontSize: h[1].length === 1 ? 13 : 11, margin: [0, 8, 0, 4] });
      continue;
    }
    const li = l.match(/^\s*[-*•]\s+(.*)$/);
    if (li) {
      (list ||= []).push(li[1].replace(/\*\*/g, ""));
      continue;
    }
    flush();
    content.push({ text: l.replace(/\*\*/g, ""), margin: [0, 0, 0, 6], alignment: "justify" });
  }
  flush();
  return render({ pageMargins: [56, 56, 56, 56], defaultStyle: { font: "Roboto", fontSize: 10, color: INK, lineHeight: 1.3 }, content });
}
