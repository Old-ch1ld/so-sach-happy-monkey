import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // Nhập component App chính của bạn

// Tạo root DOM để ứng dụng React được gắn vào
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <React.StrictMode>
        <App /> {/* Hiển thị component App của bạn */}
    </React.StrictMode>
);
