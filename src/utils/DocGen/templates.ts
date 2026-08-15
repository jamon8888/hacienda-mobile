export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "textarea" | "number";
  }[];
  generate: (data: Record<string, any>) => Promise<string>;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "invoice",
    name: "Invoice",
    description: "Create a professional invoice",
    fields: [
      { key: "company", label: "Company Name", type: "text" },
      { key: "client", label: "Client Name", type: "text" },
      { key: "items", label: "Line Items (one per line)", type: "textarea" },
      { key: "total", label: "Total Amount", type: "number" },
      { key: "dueDate", label: "Due Date", type: "text" },
    ],
    generate: async data => {
      const { generateDocx } = await import("./DocGenerator");
      return generateDocx({
        title: `Invoice-${Date.now()}`,
        content: [
          "Invoice",
          "",
          `From: ${data.company}`,
          `To: ${data.client}`,
          "",
          "Items:",
          data.items,
          "",
          `Total: $${data.total}`,
          `Due Date: ${data.dueDate}`,
        ],
      });
    },
  },
  {
    id: "report",
    name: "Report",
    description: "Generate a formatted report",
    fields: [
      { key: "title", label: "Report Title", type: "text" },
      { key: "content", label: "Report Content", type: "textarea" },
      { key: "conclusion", label: "Conclusion", type: "textarea" },
    ],
    generate: async data => {
      const { generateDocx } = await import("./DocGenerator");
      return generateDocx({
        title: data.title,
        content: [data.content, "", "Conclusion:", data.conclusion],
      });
    },
  },
];

export function getTemplate(templateId: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find(t => t.id === templateId);
}
