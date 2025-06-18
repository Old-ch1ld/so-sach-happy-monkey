import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // `root` mặc định là '.' (thư mục gốc của dự án) nên không cần khai báo
    // `publicDir` không cần nếu index.html ở thư mục gốc và không có tài nguyên tĩnh khác trong public/
    build: {
        outDir: "dist", // Thư mục đầu ra khi build
        emptyOutDir: true, // Đảm bảo thư mục dist được làm sạch trước khi build
        // Vite sẽ tự động phát hiện index.html ở thư mục gốc và xử lý nó như điểm vào
        // Không cần `rollupOptions.input` khi index.html ở root cho SPA đơn giản
    },
    server: {
        open: true, // Tự động mở trình duyệt khi chạy dev server
    },
});
