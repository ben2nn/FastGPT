export const readFileRawText = (file: File) => file.text();

export const fileDownload = ({ content, filename }: any) => {
  const blob = new Blob([content]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
};
