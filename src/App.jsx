import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged,
} from "firebase/auth";
import {
    getFirestore,
    doc,
    addDoc,
    onSnapshot,
    collection,
    serverTimestamp,
    getDoc,
    updateDoc,
    query,
    where,
    getDocs,
} from "firebase/firestore";

// Global variables for Firebase configuration, provided by the Canvas environment
// Cấu hình Firebase đọc từ biến môi trường (sau khi triển khai)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    // measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // Bỏ comment nếu bạn có measurementId
};

console.log("Firebase Config loaded:", firebaseConfig);

// appId cho đường dẫn Firestore của người dùng
// Lấy projectId từ cấu hình Firebase, hoặc dùng fallback nếu không có
const appId = firebaseConfig.projectId || "default-app-id"; // Dùng projectId làm appId để nhất quán với đường dẫn Firestore
const initialAuthToken = null; // Token này chỉ dùng trong môi trường Canvas, không cần khi deploy thật

console.log("App ID for Firestore paths:", appId);

function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState("detailedLedger"); // 'detailedLedger', 'stockCheck', or 'expenseLedger'
    const [message, setMessage] = useState("");

    // State for Detailed Ledger (Sổ chi tiết)
    const [ledgerEntries, setLedgerEntries] = useState([]);
    const [voucherNumber, setVoucherNumber] = useState("");
    const [entryDate, setEntryDate] = useState(""); // DD-MM-YYYY
    const [productName, setProductName] = useState("");
    const [unit, setUnit] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [quantityIn, setQuantityIn] = useState("");
    const [amountIn, setAmountIn] = useState(""); // Calculated field
    const [quantityOut, setQuantityOut] = useState("");
    const [amountOut, setAmountOut] = useState(""); // Calculated field
    const [note, setNote] = useState("");
    const [isSuggestingUnit, setIsSuggestingUnit] = useState(false); // New state for AI suggestion loading

    // State for Stock Check
    const [inventoryItems, setInventoryItems] = useState([]);
    const [itemName, setItemName] = useState("");
    const [unitOfMeasure, setUnitOfMeasure] = useState("");
    const [unitCost, setUnitCost] = useState("");
    const [lowStockThreshold, setLowStockThreshold] = useState("");

    // State for Expense Ledger (Sổ chi phí sản xuất, kinh doanh)
    const [expenseEntries, setExpenseEntries] = useState([]);
    const [expenseEntryDate, setExpenseEntryDate] = useState(""); // DD-MM-YYYY
    const [expenseVoucherNumber, setExpenseVoucherNumber] = useState("");
    const [description, setDescription] = useState("");
    const [totalAmount, setTotalAmount] = useState("");
    const [expenseType, setExpenseType] = useState("");

    // Expense Categories for dropdown
    const expenseCategories = [
        "", // Default empty option
        "Chi phí nhập hàng",
        "Chi phí nhân công",
        "Chi phí điện",
        "Chi phí nước",
        "Chi phí viễn thông",
        "Chi phí thuê kho bãi, mặt bằng kinh doanh",
        "Chi phí quản lí (văn phòng phẩm, công cụ, dụng cụ,...)",
        "Chi phí khác (hội nghị, công tác phí, thanh lý, nhượng bán tài sản cố định, thuê ngoài khác,...)",
        // New category added here
    ];

    // Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            setAuth(firebaseAuth);

            // Listen for auth state changes
            const unsubscribe = onAuthStateChanged(
                firebaseAuth,
                async (user) => {
                    if (user) {
                        setUserId(user.uid);
                        setMessage(
                            `Chào mừng bạn! ID người dùng của bạn: ${user.uid}`
                        );
                    } else {
                        // Sign in anonymously if no token is provided or if the token has expired/is invalid.
                        try {
                            if (initialAuthToken) {
                                await signInWithCustomToken(
                                    firebaseAuth,
                                    initialAuthToken
                                );
                            } else {
                                await signInAnonymously(firebaseAuth);
                            }
                        } catch (error) {
                            console.error("Lỗi xác thực Firebase:", error);
                            setMessage(`Xác thực thất bại: ${error.message}`);
                        }
                    }
                    setLoading(false);
                }
            );

            return () => unsubscribe(); // Cleanup auth listener
        } catch (error) {
            console.error("Không thể khởi tạo Firebase:", error);
            setMessage(`Không thể khởi tạo ứng dụng: ${error.message}`);
            setLoading(false);
        }
    }, []);

    // Firestore Real-time Listeners (Detailed Ledger, Inventory, and Expense Ledger)
    useEffect(() => {
        if (!db || !userId) {
            return;
        }

        // Listener for Detailed Ledger (Sổ chi tiết)
        const detailedLedgerCollectionRef = collection(
            db,
            `artifacts/${appId}/users/${userId}/detailedLedger`
        );
        const unsubscribeDetailedLedger = onSnapshot(
            detailedLedgerCollectionRef,
            (snapshot) => {
                const fetchedEntries = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                // Sort by date and then timestamp for consistency (newest first)
                fetchedEntries.sort((a, b) => {
                    // Primary sort by date descending
                    if (a.entryDate < b.entryDate) return 1;
                    if (a.entryDate > b.entryDate) return -1;
                    // Secondary sort by timestamp descending if dates are the same
                    if (a.timestamp && b.timestamp) {
                        return b.timestamp.toMillis() - a.timestamp.toMillis();
                    }
                    return 0;
                });
                setLedgerEntries(fetchedEntries);
            },
            (error) => {
                console.error("Lỗi khi lấy sổ chi tiết:", error);
                setMessage(`Lỗi khi tải sổ chi tiết: ${error.message}`);
            }
        );

        // Listener for Inventory Items
        const inventoryCollectionRef = collection(
            db,
            `artifacts/${appId}/users/${userId}/inventory`
        );
        const unsubscribeInventory = onSnapshot(
            inventoryCollectionRef,
            (snapshot) => {
                const fetchedInventory = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                setInventoryItems(fetchedInventory);
            },
            (error) => {
                console.error("Lỗi khi lấy tồn kho:", error);
                setMessage(`Lỗi khi tải tồn kho: ${error.message}`);
            }
        );

        // Listener for Expense Ledger (Sổ chi phí)
        const expenseLedgerCollectionRef = collection(
            db,
            `artifacts/${appId}/users/${userId}/expenseLedger`
        );
        const unsubscribeExpenseLedger = onSnapshot(
            expenseLedgerCollectionRef,
            (snapshot) => {
                const fetchedExpenses = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                // Sort by date and then timestamp for consistency (newest first)
                fetchedExpenses.sort((a, b) => {
                    if (a.expenseEntryDate < b.expenseEntryDate) return 1;
                    if (a.expenseEntryDate > b.expenseEntryDate) return -1;
                    if (a.timestamp && b.timestamp) {
                        return b.timestamp.toMillis() - a.timestamp.toMillis();
                    }
                    return 0;
                });
                setExpenseEntries(fetchedExpenses);
            },
            (error) => {
                console.error("Lỗi khi lấy sổ chi phí:", error);
                setMessage(`Lỗi khi tải sổ chi phí: ${error.message}`);
            }
        );

        // Cleanup listeners
        return () => {
            unsubscribeDetailedLedger();
            unsubscribeInventory();
            unsubscribeExpenseLedger();
        };
    }, [db, userId]); // Re-run effect if db or userId changes

    // Function to generate a random string of 3 uppercase letters
    const generateRandomLetters = () => {
        let result = "";
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (let i = 0; i < 3; i++) {
            result += characters.charAt(
                Math.floor(Math.random() * characters.length)
            );
        }
        return result;
    };

    // Helper to clear detailed ledger form fields and generate voucher number
    const clearDetailedLedgerForm = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");

        const formattedDate = `${day}${month}${year}`;
        const randomLetters = generateRandomLetters();
        const newVoucherNumber = `${formattedDate}-${randomLetters}`;

        setVoucherNumber(newVoucherNumber);
        setEntryDate(`${year}-${month}-${day}`);
        setProductName("");
        setUnit("");
        setUnitPrice("");
        setQuantityIn("");
        setAmountIn("");
        setQuantityOut("");
        setAmountOut("");
        setNote("");
    };

    // Helper to clear inventory form fields
    const clearInventoryForm = () => {
        setItemName("");
        setUnitOfMeasure("");
        setUnitCost("");
        setLowStockThreshold("");
    };

    // Helper to clear expense form fields and generate voucher number
    const clearExpenseForm = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");

        const formattedDate = `${day}${month}${year}`;
        const randomLetters = generateRandomLetters();
        const newExpenseVoucherNumber = `${formattedDate}-${randomLetters}-CP`; // CP for Chi Phí

        setExpenseEntryDate(`${year}-${month}-${day}`);
        setExpenseVoucherNumber(newExpenseVoucherNumber);
        setDescription("");
        setTotalAmount("");
        setExpenseType(""); // Reset dropdown to default
    };

    // Initialize forms on component mount or view change
    useEffect(() => {
        clearDetailedLedgerForm();
        clearInventoryForm();
        clearExpenseForm(); // Clear expense form on view change
    }, [view]); // Clear forms when view changes

    // Calculate Thành tiền nhập/xuất when quantity or unit price changes
    useEffect(() => {
        const price = parseFloat(unitPrice || 0);
        const qIn = parseFloat(quantityIn || 0);
        const qOut = parseFloat(quantityOut || 0);
        setAmountIn(isNaN(qIn * price) ? "" : (qIn * price).toFixed(0));
        setAmountOut(isNaN(qOut * price) ? "" : (qOut * price).toFixed(0));
    }, [quantityIn, quantityOut, unitPrice]);

    // Handle AI unit suggestion
    const handleSuggestUnit = async () => {
        if (!productName) {
            setMessage(
                "Vui lòng nhập Tên sản phẩm trước khi gợi ý đơn vị tính."
            );
            return;
        }
        setIsSuggestingUnit(true);
        setMessage("Đang gợi ý đơn vị tính bằng AI...");

        try {
            const chatHistory = [];
            chatHistory.push({
                role: "user",
                parts: [
                    {
                        text: `Gợi ý đơn vị tính phổ biến nhất cho sản phẩm '${productName}' (ví dụ: kg, lít, cái, gói, chai, hộp). Chỉ trả lời một từ duy nhất, không kèm giải thích.`,
                    },
                ],
            });
            const payload = { contents: chatHistory };
            const apiKey = ""; // API key will be provided by Canvas runtime if empty
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (
                result.candidates &&
                result.candidates.length > 0 &&
                result.candidates[0].content &&
                result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0
            ) {
                const suggestedUnit = result.candidates[0].content.parts[0].text
                    .trim()
                    .toLowerCase();
                setUnit(suggestedUnit);
                setMessage(`Đã gợi ý đơn vị tính: ${suggestedUnit}`);
            } else {
                setMessage("Không thể gợi ý đơn vị tính. Vui lòng thử lại.");
            }
        } catch (error) {
            console.error("Lỗi khi gợi ý đơn vị tính bằng AI:", error);
            setMessage(`Lỗi khi gợi ý đơn vị tính: ${error.message}`);
        } finally {
            setIsSuggestingUnit(false);
        }
    };

    // Add Detailed Ledger Entry and Update Inventory
    const handleAddLedgerEntry = async () => {
        if (
            !db ||
            !userId ||
            !voucherNumber ||
            !entryDate ||
            !productName ||
            !unit ||
            !unitPrice
        ) {
            setMessage(
                "Vui lòng điền đầy đủ các trường bắt buộc cho Sổ chi tiết."
            );
            return;
        }

        const actualQuantityIn = parseFloat(quantityIn || 0);
        const actualQuantityOut = parseFloat(quantityOut || 0);

        if (actualQuantityIn <= 0 && actualQuantityOut <= 0) {
            setMessage(
                "Vui lòng nhập Số lượng nhập hoặc Số lượng xuất lớn hơn 0."
            );
            return;
        }

        const entryData = {
            voucherNumber: voucherNumber,
            entryDate: entryDate,
            productName: productName,
            unit: unit,
            unitPrice: parseFloat(unitPrice),
            quantityIn: actualQuantityIn,
            amountIn: parseFloat(amountIn || 0),
            amountOut: parseFloat(amountOut || 0),
            note: note,
            timestamp: serverTimestamp(),
        };

        try {
            // 1. Add entry to Detailed Ledger
            await addDoc(
                collection(
                    db,
                    `artifacts/${appId}/users/${userId}/detailedLedger`
                ),
                entryData
            );

            // 2. Update Inventory based on this ledger entry
            const inventoryCollectionRef = collection(
                db,
                `artifacts/${appId}/users/${userId}/inventory`
            );
            const q = query(
                inventoryCollectionRef,
                where("name", "==", productName)
            );
            const querySnapshot = await getDocs(q);

            let newQuantityChange = actualQuantityIn - actualQuantityOut;

            if (!querySnapshot.empty) {
                // Item exists, update its quantity
                const docToUpdate = querySnapshot.docs[0];
                const currentInventoryData = docToUpdate.data();
                const currentInventoryQuantity =
                    currentInventoryData.quantity || 0;
                const updatedQuantity =
                    currentInventoryQuantity + newQuantityChange;

                // Also update unit and cost if they are different from existing inventory item (optional, for data consistency)
                await updateDoc(
                    doc(
                        db,
                        `artifacts/${appId}/users/${userId}/inventory`,
                        docToUpdate.id
                    ),
                    {
                        quantity: updatedQuantity,
                        unit: unit, // Update unit if changed in ledger
                        cost: parseFloat(unitPrice), // Update cost if changed in ledger
                    }
                );
                setMessage(
                    `Mục Sổ chi tiết đã được thêm thành công và tồn kho của '${productName}' đã cập nhật.`
                );
            } else {
                // Item does not exist, create a new one in inventory
                const newItem = {
                    name: productName,
                    quantity: newQuantityChange, // Initial quantity based on this first transaction
                    unit: unit, // Use unit from ledger
                    cost: parseFloat(unitPrice), // Use unitPrice from ledger as initial cost
                    threshold: 1, // Default threshold for new items
                    timestamp: serverTimestamp(),
                };
                await addDoc(inventoryCollectionRef, newItem);
                setMessage(
                    `Mục Sổ chi tiết đã được thêm thành công và '${productName}' đã được thêm vào tồn kho.`
                );
            }

            clearDetailedLedgerForm();
        } catch (error) {
            console.error(
                "Lỗi khi thêm mục sổ chi tiết hoặc cập nhật tồn kho:",
                error
            );
            setMessage(`Lỗi: ${error.message}`);
        }
    };

    // Add new Inventory Item (Now primarily for defining item metadata, quantity controlled by ledger)
    const handleAddItem = async () => {
        if (
            !db ||
            !userId ||
            !itemName ||
            !unitOfMeasure ||
            !unitCost ||
            !lowStockThreshold
        ) {
            setMessage(
                "Vui lòng điền đầy đủ các trường để thêm mặt hàng tồn kho."
            );
            return;
        }

        // Check if item already exists
        const inventoryCollectionRef = collection(
            db,
            `artifacts/${appId}/users/${userId}/inventory`
        );
        const q = query(inventoryCollectionRef, where("name", "==", itemName));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            setMessage(
                `Mặt hàng '${itemName}' đã tồn tại trong kho. Vui lòng nhập qua Sổ Chi Tiết để điều chỉnh số lượng.`
            );
            return;
        }

        const newItem = {
            name: itemName,
            quantity: 0, // Quantity starts at 0, updated by ledger
            unit: unitOfMeasure,
            cost: parseFloat(unitCost),
            threshold: parseFloat(lowStockThreshold),
            timestamp: serverTimestamp(),
        };

        try {
            await addDoc(inventoryCollectionRef, newItem);
            setMessage(
                `Mặt hàng '${itemName}' đã được thêm vào kho (số lượng ban đầu là 0).`
            );
            clearInventoryForm();
        } catch (error) {
            console.error("Lỗi khi thêm mặt hàng:", error);
            setMessage(`Lỗi khi thêm mặt hàng: ${error.message}`);
        }
    };

    // Add Expense Ledger Entry
    const handleAddExpenseEntry = async () => {
        if (
            !db ||
            !userId ||
            !expenseEntryDate ||
            !expenseVoucherNumber ||
            !description ||
            !totalAmount ||
            !expenseType
        ) {
            setMessage(
                "Vui lòng điền đầy đủ các trường bắt buộc cho Sổ chi phí."
            );
            return;
        }
        if (parseFloat(totalAmount) <= 0) {
            setMessage("Tổng số tiền phải lớn hơn 0.");
            return;
        }

        const expenseData = {
            expenseEntryDate: expenseEntryDate,
            expenseVoucherNumber: expenseVoucherNumber,
            description: description,
            totalAmount: parseFloat(totalAmount),
            expenseType: expenseType,
            timestamp: serverTimestamp(),
        };

        try {
            await addDoc(
                collection(
                    db,
                    `artifacts/${appId}/users/${userId}/expenseLedger`
                ),
                expenseData
            );
            setMessage(`Mục Sổ chi phí đã được thêm thành công!`);
            clearExpenseForm();
        } catch (error) {
            console.error("Lỗi khi thêm mục sổ chi phí:", error);
            setMessage(`Lỗi khi thêm mục sổ chi phí: ${error.message}`);
        }
    };

    // Function to export ledger data to CSV
    const handleExportLedger = () => {
        if (ledgerEntries.length === 0) {
            setMessage("Không có dữ liệu sổ chi tiết để xuất.");
            return;
        }

        const headers = [
            "Số hiệu chứng từ",
            "Ngày tháng",
            "Tên sản phẩm",
            "Đơn vị tính",
            "Đơn giá",
            "Số lượng nhập",
            "Thành tiền nhập",
            "Thành tiền xuất",
            "Ghi chú",
        ];

        // Map data to match header order and format as CSV rows
        const csvRows = ledgerEntries.map((entry) =>
            [
                entry.voucherNumber,
                entry.entryDate,
                entry.productName,
                entry.unit,
                entry.unitPrice.toFixed(0),
                entry.quantityIn,
                entry.amountIn.toFixed(0),
                entry.quantityOut,
                entry.amountOut.toFixed(0),
                entry.note,
            ]
                .map((value) => `"${String(value).replace(/"/g, '""')}"`)
                .join(",")
        ); // Enclose values in quotes and escape internal quotes

        const csvString = [
            headers.map((header) => `"${header}"`).join(","), // Enclose headers in quotes
            ...csvRows,
        ].join("\n");

        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute(
            "download",
            `so_chi_tiet_${new Date().toISOString().slice(0, 10)}.csv`
        );
        document.body.appendChild(link); // Append to body to ensure it's in the DOM
        link.click(); // Programmatically click the link to trigger download
        document.body.removeChild(link); // Clean up the DOM
        setMessage("Dữ liệu sổ chi tiết đã được xuất thành công sang CSV!");
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <p className="text-xl">Đang tải ứng dụng...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100 font-inter p-4 sm:p-6 md:p-8 rounded-lg shadow-xl">
            <div className="max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl bg-white dark:bg-gray-800">
                {/* Header and Navigation */}
                <header className="bg-indigo-600 dark:bg-purple-900 p-4 rounded-t-xl">
                    <h1 className="text-3xl font-bold text-white text-center mb-4">
                        Happy Monkey Burger 🍔
                    </h1>
                    {userId && (
                        <p className="text-sm text-center text-indigo-100 dark:text-purple-200 mb-4">
                            ID người dùng của bạn:{" "}
                            <span className="font-mono bg-indigo-700 dark:bg-purple-800 px-2 py-1 rounded-md">
                                {userId}
                            </span>
                        </p>
                    )}
                    <nav className="flex justify-center space-x-4">
                        <button
                            onClick={() => setView("detailedLedger")}
                            className={`px-6 py-2 rounded-full font-semibold transition-all duration-300 ${
                                view === "detailedLedger"
                                    ? "bg-white text-indigo-700 shadow-md transform scale-105"
                                    : "bg-indigo-500 text-white hover:bg-indigo-400 dark:bg-purple-700 dark:hover:bg-purple-600"
                            }`}
                        >
                            Sổ Chi Tiết
                        </button>
                        <button
                            onClick={() => setView("stockCheck")}
                            className={`px-6 py-2 rounded-full font-semibold transition-all duration-300 ${
                                view === "stockCheck"
                                    ? "bg-white text-indigo-700 shadow-md transform scale-105"
                                    : "bg-indigo-500 text-white hover:bg-indigo-400 dark:bg-purple-700 dark:hover:bg-purple-600"
                            }`}
                        >
                            Kiểm Tra Kho
                        </button>
                        <button
                            onClick={() => setView("expenseLedger")}
                            className={`px-6 py-2 rounded-full font-semibold transition-all duration-300 ${
                                view === "expenseLedger"
                                    ? "bg-white text-indigo-700 shadow-md transform scale-105"
                                    : "bg-indigo-500 text-white hover:bg-indigo-400 dark:bg-purple-700 dark:hover:bg-purple-600"
                            }`}
                        >
                            Sổ Chi Phí
                        </button>
                    </nav>
                </header>

                {/* Message Display */}
                {message && (
                    <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 p-3 m-4 rounded-md text-center shadow-inner">
                        {message}
                    </div>
                )}

                {/* Main Content Area */}
                <main className="p-4 sm:p-6 md:p-8">
                    {view === "detailedLedger" && (
                        <div className="space-y-8">
                            <h2 className="text-2xl font-bold text-indigo-700 dark:text-purple-400 text-center">
                                Sổ Chi Tiết
                            </h2>

                            {/* Detailed Ledger Input Form */}
                            <section className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-600">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                                    Ghi Sổ Chi Tiết Mới
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                    <div>
                                        <label
                                            htmlFor="voucherNumber"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Số hiệu chứng từ
                                        </label>
                                        <input
                                            type="text"
                                            id="voucherNumber"
                                            value={voucherNumber}
                                            readOnly // Make it read-only as it's auto-generated
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white bg-gray-200 dark:bg-gray-700"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="entryDate"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Ngày tháng
                                        </label>
                                        <input
                                            type="date"
                                            id="entryDate"
                                            value={entryDate}
                                            onChange={(e) =>
                                                setEntryDate(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="productName"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Tên sản phẩm
                                        </label>
                                        <input
                                            type="text"
                                            id="productName"
                                            value={productName}
                                            onChange={(e) =>
                                                setProductName(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            required
                                        />
                                    </div>
                                    <div className="relative">
                                        {" "}
                                        {/* Added relative for button positioning */}
                                        <label
                                            htmlFor="unit"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Đơn vị tính
                                        </label>
                                        <input
                                            type="text"
                                            id="unit"
                                            value={unit}
                                            onChange={(e) =>
                                                setUnit(e.target.value)
                                            }
                                            className="w-full p-2 pr-24 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            required
                                        />
                                        <button
                                            onClick={handleSuggestUnit}
                                            disabled={
                                                isSuggestingUnit || !productName
                                            } // Disable if suggesting or no product name
                                            className="absolute right-1 top-7 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSuggestingUnit
                                                ? "Đang gợi ý..."
                                                : "Gợi ý ĐVT (AI)"}
                                        </button>
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="unitPrice"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Đơn giá
                                        </label>
                                        <input
                                            type="number"
                                            id="unitPrice"
                                            value={unitPrice}
                                            onChange={(e) =>
                                                setUnitPrice(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="0"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="quantityIn"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Số lượng nhập
                                        </label>
                                        <input
                                            type="number"
                                            id="quantityIn"
                                            value={quantityIn}
                                            onChange={(e) =>
                                                setQuantityIn(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="amountIn"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Thành tiền nhập
                                        </label>
                                        <input
                                            type="text"
                                            id="amountIn"
                                            value={amountIn}
                                            readOnly
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-300"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="quantityOut"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Số lượng xuất
                                        </label>
                                        <input
                                            type="number"
                                            id="quantityOut"
                                            value={quantityOut}
                                            onChange={(e) =>
                                                setQuantityOut(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="amountOut"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Thành tiền xuất
                                        </label>
                                        <input
                                            type="text"
                                            id="amountOut"
                                            value={amountOut}
                                            readOnly
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-300"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="lg:col-span-3">
                                        <label
                                            htmlFor="note"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Ghi chú
                                        </label>
                                        <textarea
                                            id="note"
                                            value={note}
                                            onChange={(e) =>
                                                setNote(e.target.value)
                                            }
                                            rows="2"
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                        ></textarea>
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddLedgerEntry}
                                    className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-full shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:scale-105"
                                >
                                    Thêm Mục Sổ Chi Tiết
                                </button>
                            </section>

                            {/* Past Detailed Ledger Entries List */}
                            <section className="mt-8 bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-600">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
                                    Các Mục Sổ Chi Tiết Đã Ghi
                                </h3>
                                {ledgerEntries.length === 0 ? (
                                    <p className="text-gray-600 dark:text-gray-400 text-center">
                                        Chưa có mục sổ chi tiết nào được ghi.
                                    </p>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleExportLedger}
                                            className="mb-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                                        >
                                            Xuất CSV Sổ Chi Tiết
                                        </button>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                                                <thead className="bg-gray-100 dark:bg-gray-600">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Số chứng từ
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Ngày tháng
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Tên SP
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            ĐVT
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Đơn giá
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            SL Nhập
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Thành tiền Nhập
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            SL Xuất
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Thành tiền Xuất
                                                        </th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                            Ghi chú
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                                                    {ledgerEntries.map(
                                                        (entry) => (
                                                            <tr
                                                                key={entry.id}
                                                                className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                                            >
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                    {
                                                                        entry.voucherNumber
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {
                                                                        entry.entryDate
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {
                                                                        entry.productName
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {entry.unit}
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {entry.unitPrice.toFixed(
                                                                        0
                                                                    )}{" "}
                                                                    VND
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {
                                                                        entry.quantityIn
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {entry.amountIn.toFixed(
                                                                        0
                                                                    )}{" "}
                                                                    VND
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {
                                                                        entry.quantityOut
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                    {entry.amountOut.toFixed(
                                                                        0
                                                                    )}{" "}
                                                                    VND
                                                                </td>
                                                                <td className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200 max-w-xs overflow-hidden text-ellipsis">
                                                                    {entry.note}
                                                                </td>
                                                            </tr>
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </section>
                        </div>
                    )}

                    {view === "stockCheck" && (
                        <div className="space-y-8">
                            <h2 className="text-2xl font-bold text-indigo-700 dark:text-purple-400 text-center">
                                Kiểm Tra Kho (Tồn kho)
                            </h2>

                            {/* Add New Item Form (now just for defining item metadata, quantity controlled by ledger) */}
                            <section className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-600">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                                    Thêm Mặt Hàng Tồn Kho Mới (để theo dõi)
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                                    Sử dụng phần này để thêm mặt hàng mới vào
                                    danh sách theo dõi tồn kho. Số lượng hiện
                                    tại sẽ được cập nhật tự động thông qua các
                                    giao dịch trong Sổ Chi Tiết.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label
                                            htmlFor="itemName"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Tên mặt hàng
                                        </label>
                                        <input
                                            type="text"
                                            id="itemName"
                                            value={itemName}
                                            onChange={(e) =>
                                                setItemName(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="ví dụ: Thịt bò xay (100g)"
                                            required
                                        />
                                    </div>
                                    {/* Removed currentQuantity input as it's now ledger-controlled */}
                                    <div>
                                        <label
                                            htmlFor="unitOfMeasure"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Đơn vị tính
                                        </label>
                                        <input
                                            type="text"
                                            id="unitOfMeasure"
                                            value={unitOfMeasure}
                                            onChange={(e) =>
                                                setUnitOfMeasure(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="ví dụ: kg, cái, gói"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="unitCost"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Chi phí đơn vị
                                        </label>
                                        <input
                                            type="number"
                                            id="unitCost"
                                            value={unitCost}
                                            onChange={(e) =>
                                                setUnitCost(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="0"
                                            required
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label
                                            htmlFor="lowStockThreshold"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Ngưỡng tồn kho thấp
                                        </label>
                                        <input
                                            type="number"
                                            id="lowStockThreshold"
                                            value={lowStockThreshold}
                                            onChange={(e) =>
                                                setLowStockThreshold(
                                                    e.target.value
                                                )
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="ví dụ: 10"
                                            required
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddItem}
                                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-full shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:scale-105"
                                >
                                    Thêm Mặt Hàng Mới (tồn kho ban đầu 0)
                                </button>
                            </section>

                            {/* Inventory List */}
                            <section className="mt-8 bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-600">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
                                    Tồn Kho Hiện Tại
                                </h3>
                                {inventoryItems.length === 0 ? (
                                    <p className="text-gray-600 dark:text-gray-400 text-center">
                                        Chưa có mặt hàng tồn kho nào được thêm
                                        hoặc được ghi nhận từ sổ chi tiết.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {inventoryItems.map((item) => (
                                            <div
                                                key={item.id}
                                                className={`p-4 rounded-lg shadow-md transition-all duration-200
                                                    ${
                                                        item.quantity <
                                                        item.threshold
                                                            ? "bg-red-100 dark:bg-red-800 border-red-400 dark:border-red-600 ring-2 ring-red-500" // Highlight for low stock
                                                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                                                    }`}
                                            >
                                                <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                                                    {item.name}
                                                </h4>
                                                <p className="text-gray-700 dark:text-gray-300">
                                                    Số lượng:{" "}
                                                    <span className="font-semibold">
                                                        {item.quantity}{" "}
                                                        {item.unit}
                                                    </span>
                                                </p>
                                                <p className="text-gray-700 dark:text-gray-300">
                                                    Chi phí đơn vị:{" "}
                                                    <span className="font-semibold">
                                                        {(
                                                            item.cost || 0
                                                        ).toFixed(0)}{" "}
                                                        VND
                                                    </span>
                                                </p>
                                                <p className="text-gray-700 dark:text-gray-300 mb-4">
                                                    Ngưỡng tồn kho thấp:{" "}
                                                    <span className="font-semibold">
                                                        {item.threshold}{" "}
                                                        {item.unit}
                                                    </span>
                                                </p>
                                                {item.quantity <
                                                    item.threshold && (
                                                    <p className="text-red-600 dark:text-red-300 font-bold mb-3">
                                                        TỒN KHO THẤP! Cần đặt
                                                        hàng lại sớm.
                                                    </p>
                                                )}

                                                <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                                                    Điều chỉnh số lượng qua Sổ
                                                    Chi Tiết.
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {view === "expenseLedger" && (
                        <div className="space-y-8">
                            <h2 className="text-2xl font-bold text-indigo-700 dark:text-purple-400 text-center">
                                Sổ Chi Phí Sản Xuất, Kinh Doanh
                            </h2>

                            {/* Expense Ledger Input Form */}
                            <section className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-600">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                                    Ghi Sổ Chi Phí Mới
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label
                                            htmlFor="expenseEntryDate"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Ngày tháng năm ghi sổ
                                        </label>
                                        <input
                                            type="date"
                                            id="expenseEntryDate"
                                            value={expenseEntryDate}
                                            onChange={(e) =>
                                                setExpenseEntryDate(
                                                    e.target.value
                                                )
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="expenseVoucherNumber"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Số hiệu chứng từ
                                        </label>
                                        <input
                                            type="text"
                                            id="expenseVoucherNumber"
                                            value={expenseVoucherNumber}
                                            readOnly // Auto-generated
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-200 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-300"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label
                                            htmlFor="description"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Diễn giải
                                        </label>
                                        <textarea
                                            id="description"
                                            value={description}
                                            onChange={(e) =>
                                                setDescription(e.target.value)
                                            }
                                            rows="2"
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            required
                                        ></textarea>
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="totalAmount"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Tổng số tiền
                                        </label>
                                        <input
                                            type="number"
                                            id="totalAmount"
                                            value={totalAmount}
                                            onChange={(e) =>
                                                setTotalAmount(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            placeholder="0"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="expenseType"
                                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                        >
                                            Loại chi phí
                                        </label>
                                        <select
                                            id="expenseType"
                                            value={expenseType}
                                            onChange={(e) =>
                                                setExpenseType(e.target.value)
                                            }
                                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                            required
                                        >
                                            {expenseCategories.map(
                                                (category, index) => (
                                                    <option
                                                        key={index}
                                                        value={category}
                                                        disabled={
                                                            category === ""
                                                        }
                                                    >
                                                        {category === ""
                                                            ? "Chọn loại chi phí"
                                                            : category}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddExpenseEntry}
                                    className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-full shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-1 hover:scale-105"
                                >
                                    Thêm Mục Sổ Chi Phí
                                </button>
                            </section>

                            {/* Past Expense Entries List */}
                            <section className="mt-8 bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-600">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 text-center">
                                    Các Mục Sổ Chi Phí Đã Ghi
                                </h3>
                                {expenseEntries.length === 0 ? (
                                    <p className="text-gray-600 dark:text-gray-400 text-center">
                                        Chưa có mục sổ chi phí nào được ghi.
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                                            <thead className="bg-gray-100 dark:bg-gray-600">
                                                <tr>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Ngày tháng
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Số chứng từ
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Diễn giải
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Tổng số tiền
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                        Loại chi phí
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                                                {expenseEntries.map(
                                                    (expense) => (
                                                        <tr
                                                            key={expense.id}
                                                            className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                                        >
                                                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                {
                                                                    expense.expenseEntryDate
                                                                }
                                                            </td>
                                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                {
                                                                    expense.expenseVoucherNumber
                                                                }
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200 max-w-xs overflow-hidden text-ellipsis">
                                                                {
                                                                    expense.description
                                                                }
                                                            </td>
                                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                {expense.totalAmount.toFixed(
                                                                    0
                                                                )}{" "}
                                                                VND
                                                            </td>
                                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                                                {
                                                                    expense.expenseType
                                                                }
                                                            </td>
                                                        </tr>
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
