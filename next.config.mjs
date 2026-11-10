/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg", "pdfmake", "pdfkit", "mammoth"],
};
export default nextConfig;
