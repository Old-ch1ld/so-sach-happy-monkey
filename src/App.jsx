import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, serverTimestamp, getDocs, updateDoc, query, where, deleteDoc } from 'firebase/firestore'; // Added deleteDoc

// Global variables for Firebase configuration, provided by the Canvas environment
// Biến toàn cục cho cấu hình Firebase, được cung cấp bởi môi trường Canvas
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Function to format numbers with commas for thousands
// Hàm định dạng số với dấu phẩy
const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '';
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};

function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('detailedLedger'); // 'detailedLedger', 'stockCheck', or 'expenseLedger'
    const [message, setMessage] = useState('');

    // State for Detailed Ledger
    // State cho Sổ chi tiết
    const [ledgerEntries, setLedgerEntries] = useState([]);
    const [voucherNumber, setVoucherNumber] = useState('');
    const [entryDate, setEntryDate] = useState('');
    const [productName, setProductName] = useState('');
    const [unit, setUnit] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [quantityIn, setQuantityIn] = useState('');
    const [amountIn, setAmountIn] = useState('');
    const [quantityOut, setQuantityOut] = useState('');
    const [amountOut, setAmountOut] = useState('');
    const [note, setNote] = useState('');
    const [isSuggestingUnit, setIsSuggestingUnit] = useState(false);

    // State for Stock Check
    // State cho Kiểm tra Kho
    const [inventoryItems, setInventoryItems] = useState([]);
    const [itemName, setItemName] = useState(''); // CORRECTED: Was a string literal, now a state variable
    const [unitOfMeasure, setUnitOfMeasure] = useState(''); // CORRECTED: Was a string literal, now a state variable
    const [unitCost, setUnitCost] = useState(''); // CORRECTED: Was a string literal, now a state variable
    const [lowStockThreshold, setLowStockThreshold] = useState(''); // CORRECTED: Was a string literal, now a state variable
    const [editingItemId, setEditingItemId] = useState(null); // New state for editing inventory item

    // State for Expense Ledger
    // State cho Sổ chi phí
    const [expenseEntries, setExpenseEntries] = useState([]);
    const [expenseEntryDate, setExpenseEntryDate] = useState(''); 
    const [expenseVoucherNumber, setExpenseVoucherNumber] = useState('');
    const [description, setDescription] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [expenseType, setExpenseType] = useState('');

    // Expense Categories
    // Các loại chi phí
    const expenseCategories = [
        "", "Chi phí nhập hàng", "Chi phí nhân công", "Chi phí điện", "Chi phí nước",
        "Chi phí viễn thông", "Chi phí thuê kho bãi, mặt bằng kinh doanh",
        "Chi phí quản lí (văn phòng phẩm, công cụ, dụng cụ,...)",
        "Chi phí khác (hội nghị, công tác phí, thanh lý,...)"
    ];

    // Initialize Firebase and Authentication
    // Khởi tạo Firebase và Xác thực
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestore);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setMessage(`Chào mừng! ID của bạn: ${user.uid}`);
                } else {
                    try {
                        if (initialAuthToken) {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (error) {
                        console.error("Lỗi xác thực Firebase:", error);
                        setMessage(`Xác thực thất bại: ${error.message}`);
                    }
                }
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Không thể khởi tạo Firebase:", error);
            setMessage(`Không thể khởi tạo ứng dụng: ${error.message}`);
            setLoading(false);
        }
    }, []);

    // Real-time data listener from Firestore
    // Listener dữ liệu thời gian thực từ Firestore
    useEffect(() => {
        if (!db || !userId) return;

        // Listener for Detailed Ledger
        // Listener cho Sổ Chi Tiết
        const detailedLedgerCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/detailedLedger`);
        const unsubscribeDetailedLedger = onSnapshot(detailedLedgerCollectionRef, (snapshot) => {
            const fetchedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            fetchedEntries.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            setLedgerEntries(fetchedEntries);
        }, (error) => console.error("Lỗi lấy sổ chi tiết:", error));

        // Listener for Inventory
        // Listener cho Kho
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
        const unsubscribeInventory = onSnapshot(inventoryCollectionRef, (snapshot) => {
            const fetchedInventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventoryItems(fetchedInventory);
        }, (error) => console.error("Lỗi lấy tồn kho:", error));

        // Listener for Expense Ledger
        // Listener cho Sổ Chi Phí
        const expenseLedgerCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenseLedger`);
        const unsubscribeExpenseLedger = onSnapshot(expenseLedgerCollectionRef, (snapshot) => {
            const fetchedExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            fetchedExpenses.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            setExpenseEntries(fetchedExpenses);
        }, (error) => console.error("Lỗi lấy sổ chi phí:", error));

        return () => {
            unsubscribeDetailedLedger();
            unsubscribeInventory();
            unsubscribeExpenseLedger();
        };
    }, [db, userId, appId]);

    // Function to generate random letters for voucher number
    // Hàm tạo mã ngẫu nhiên
    const generateRandomLetters = () => {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let i = 0; i < 3; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };

    // Function to clear the form and generate a new voucher number
    // Hàm xóa form và tạo mã chứng từ mới
    const clearDetailedLedgerForm = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${day}${month}${year}`;
        const randomLetters = generateRandomLetters();
        setVoucherNumber(`${formattedDate}-${randomLetters}`);
        setEntryDate(`${year}-${month}-${day}`);
        setProductName(''); setUnit(''); setUnitPrice('');
        setQuantityIn(''); setAmountIn(''); setQuantityOut('');
        setAmountOut(''); setNote('');
    };

    const clearInventoryForm = () => {
        setItemName(''); setUnitOfMeasure(''); setUnitCost(''); setLowStockThreshold('');
        setEditingItemId(null); // Clear editing state when form is cleared
    };

    const clearExpenseForm = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${day}${month}${year}`;
        const randomLetters = generateRandomLetters();
        setExpenseVoucherNumber(`${formattedDate}-${randomLetters}-CP`);
        setExpenseEntryDate(`${year}-${month}-${day}`);
        setDescription(''); setTotalAmount(''); setExpenseType('');
    };

    // Initialize forms when switching views
    // Khởi tạo form khi chuyển view
    useEffect(() => {
        clearDetailedLedgerForm();
        clearInventoryForm();
        clearExpenseForm();
    }, [view]);

    // Automatically calculate Amount In/Out
    // Tự động tính Thành tiền
    useEffect(() => {
        const price = parseFloat(unitPrice) || 0;
        const qIn = parseFloat(quantityIn) || 0;
        const qOut = parseFloat(quantityOut) || 0;
        setAmountIn(qIn * price);
        setAmountOut(qOut * price);
    }, [quantityIn, quantityOut, unitPrice]);

    // AI Unit Suggestion
    // Gợi ý đơn vị tính bằng AI
    const handleSuggestUnit = async () => {
        if (!productName) {
            setMessage("Vui lòng nhập Tên sản phẩm.");
            return;
        }
        setIsSuggestingUnit(true);
        setMessage("AI đang gợi ý đơn vị tính...");
        try {
            const chatHistory = [{ role: "user", parts: [{ text: `Gợi ý đơn vị tính phổ biến nhất cho sản phẩm '${productName}' (ví dụ: kg, lít, cái, gói, chai, hộp). Chỉ trả lời một từ duy nhất, không kèm giải thích.` }] }];
            const payload = { contents: chatHistory };
            // The API key is handled by the Canvas environment for Gemini API calls.
            // API key được xử lý bởi môi trường Canvas cho các cuộc gọi Gemini API.
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (result.candidates && result.candidates[0]?.content?.parts?.[0]) {
                const suggestedUnit = result.candidates[0].content.parts[0].text.trim().toLowerCase();
                setUnit(suggestedUnit);
                setMessage(`Đã gợi ý: ${suggestedUnit}`);
            } else {
                setMessage("Không thể gợi ý. Vui lòng thử lại.");
            }
        } catch (error) {
            console.error("Lỗi AI:", error);
            setMessage(`Lỗi khi gợi ý: ${error.message}`);
        } finally {
            setIsSuggestingUnit(false);
        }
    };

    // Add entry to Detailed Ledger and update Inventory
    // Thêm bút toán vào Sổ chi tiết và cập nhật Kho
    const handleAddLedgerEntry = async () => {
        if (!db || !userId || !productName || !unit || !unitPrice) {
            setMessage("Vui lòng điền các trường bắt buộc.");
            return;
        }
        const qIn = parseFloat(quantityIn) || 0;
        const qOut = parseFloat(quantityOut) || 0;
        if (qIn <= 0 && qOut <= 0) {
            setMessage("Số lượng nhập hoặc xuất phải lớn hơn 0.");
            return;
        }

        const entryData = {
            voucherNumber, entryDate, productName, unit,
            unitPrice: parseFloat(unitPrice),
            quantityIn: qIn, amountIn: qIn * parseFloat(unitPrice),
            quantityOut: qOut, amountOut: qOut * parseFloat(unitPrice),
            note, timestamp: serverTimestamp()
        };

        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/detailedLedger`), entryData);
            const inventoryCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
            const q = query(inventoryCollectionRef, where("name", "==", productName));
            const querySnapshot = await getDocs(q);
            const quantityChange = qIn - qOut;

            if (!querySnapshot.empty) {
                const docToUpdate = querySnapshot.docs[0];
                const newQuantity = (docToUpdate.data().quantity || 0) + quantityChange;
                await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/inventory`, docToUpdate.id), {
                    quantity: newQuantity, unit: unit, cost: parseFloat(unitPrice)
                });
            } else {
                await addDoc(inventoryCollectionRef, {
                    name: productName, quantity: quantityChange, unit: unit,
                    cost: parseFloat(unitPrice), threshold: 1, timestamp: serverTimestamp()
                });
            }
            setMessage(`'${productName}' đã được cập nhật thành công.`);
            clearDetailedLedgerForm();
        } catch (error) {
            console.error("Lỗi thêm bút toán:", error);
            setMessage(`Lỗi: ${error.message}`);
        }
    };
    
    // Modified function to handle both adding and updating inventory items
    // Hàm được sửa đổi để xử lý cả việc thêm và cập nhật các mặt hàng tồn kho
    const handleSubmitInventoryItem = async () => {
        if (!db || !userId || !itemName || !unitOfMeasure || !unitCost || !lowStockThreshold) {
            setMessage("Vui lòng điền đầy đủ thông tin mặt hàng.");
            return;
        }

        const itemData = {
            name: itemName,
            unit: unitOfMeasure,
            cost: parseFloat(unitCost),
            threshold: parseFloat(lowStockThreshold),
        };

        try {
            const inventoryCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);

            if (editingItemId) {
                // Update existing item
                await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/inventory`, editingItemId), itemData);
                setMessage(`Đã cập nhật '${itemName}' thành công.`);
            } else {
                // Add new item - check for existing name only when adding new
                const q = query(inventoryCollectionRef, where("name", "==", itemName));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    setMessage(`Mặt hàng '${itemName}' đã tồn tại. Vui lòng cập nhật thay vì thêm mới.`);
                    return;
                }
                await addDoc(inventoryCollectionRef, {
                    ...itemData,
                    quantity: 0, // New items start with 0 quantity, updated via detailed ledger
                    timestamp: serverTimestamp()
                });
                setMessage(`Đã thêm '${itemName}' vào kho.`);
            }
            clearInventoryForm(); // Clear form and editing state
        } catch (error) {
            console.error("Lỗi xử lý mặt hàng kho:", error);
            setMessage(`Lỗi: ${error.message}`);
        }
    };

    // Function to set item for editing
    // Hàm mới để đặt mặt hàng cần chỉnh sửa
    const handleEditItem = (item) => {
        setItemName(item.name);
        setUnitOfMeasure(item.unit);
        setUnitCost(item.cost.toString());
        setLowStockThreshold(item.threshold.toString());
        setEditingItemId(item.id);
        setMessage(`Đang chỉnh sửa: '${item.name}'`);
    };

    // Function to cancel editing
    // Hàm mới để hủy chỉnh sửa
    const handleCancelEdit = () => {
        clearInventoryForm();
        setMessage('Đã hủy chỉnh sửa.');
    };

    // Function to delete an inventory item
    // Hàm mới để xóa một mặt hàng tồn kho
    const handleDeleteItem = async (id, name) => {
        if (!db || !userId) {
            setMessage("Lỗi: Không thể kết nối cơ sở dữ liệu.");
            return;
        }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/inventory`, id));
            setMessage(`Đã xóa mặt hàng '${name}' khỏi kho.`);
        } catch (error) {
            console.error("Lỗi xóa mặt hàng:", error);
            setMessage(`Lỗi khi xóa: ${error.message}`);
        }
    };

    // Add expense entry
    // Thêm bút toán chi phí
    const handleAddExpenseEntry = async () => {
        if (!db || !userId || !description || !totalAmount || !expenseType) {
            setMessage("Vui lòng điền đầy đủ các trường chi phí.");
            return;
        }
        if (parseFloat(totalAmount) <= 0) {
            setMessage("Tổng số tiền phải lớn hơn 0.");
            return;
        }
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/expenseLedger`), {
                expenseEntryDate, expenseVoucherNumber, description,
                totalAmount: parseFloat(totalAmount), expenseType,
                timestamp: serverTimestamp()
            });
            setMessage(`Đã thêm chi phí thành công.`);
            clearExpenseForm();
        } catch (error) {
            console.error("Lỗi thêm chi phí:", error);
            setMessage(`Lỗi: ${error.message}`);
        }
    };

    // Export data to CSV
    // Xuất dữ liệu ra CSV
    const handleExportLedger = () => {
        if (ledgerEntries.length === 0) {
            setMessage("Không có dữ liệu để xuất.");
            return;
        }
        const headers = ["Số hiệu CT", "Ngày", "Tên sản phẩm", "ĐVT", "Đơn giá", "SL nhập", "TT nhập", "SL xuất", "TT xuất", "Ghi chú"];
        const csvRows = ledgerEntries.map(e => [e.voucherNumber, e.entryDate, e.productName, e.unit, e.unitPrice, e.quantityIn, e.amountIn, e.quantityOut, e.amountOut, e.note].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        // Add BOM for proper UTF-8 handling in Excel
        // Thêm BOM để xử lý UTF-8 đúng cách trong Excel
        const csvString = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `so_chi_tiet_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage("Xuất CSV thành công!");
    };


    if (loading) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white"><p>Đang tải ứng dụng...</p></div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-6 font-sans">
            <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
                {/* Header */}
                {/* Tiêu đề */}
                <header className="bg-indigo-600 dark:bg-gray-950 p-4 rounded-t-lg shadow-md">
                    <h1 className="text-3xl font-bold text-white text-center mb-2">Sổ Kế Toán Mini 🍔</h1>
                    {userId && <p className="text-xs text-center text-indigo-200 dark:text-gray-400">ID: <span className="font-mono">{userId}</span></p>}
                    <nav className="flex justify-center space-x-2 sm:space-x-4 mt-4">
                        {['detailedLedger', 'stockCheck', 'expenseLedger'].map(v => (
                            <button key={v} onClick={() => setView(v)}
                                className={`px-3 sm:px-6 py-2 rounded-full font-semibold text-sm sm:text-base transition-all duration-300 ${
                                    view === v ? 'bg-white text-indigo-700 shadow-lg transform scale-105' : 'bg-indigo-500 text-white hover:bg-indigo-400 dark:bg-gray-700 dark:hover:bg-gray-600'
                                }`}>
                                {v === 'detailedLedger' ? 'Sổ Chi Tiết' : v === 'stockCheck' ? 'Kiểm Kho' : 'Sổ Chi Phí'}
                            </button>
                        ))}
                    </nav>
                </header>

                {/* Message Display */}
                {/* Hiển thị thông báo */}
                {message && <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 p-3 m-4 rounded-md text-center shadow-inner">{message}</div>}

                {/* Main Content */}
                {/* Nội dung chính */}
                <main className="p-4 sm:p-6">
                    {/* VIEW: DETAILED LEDGER */}
                    {/* CHẾ ĐỘ XEM: SỔ CHI TIẾT */}
                    {view === 'detailedLedger' && (
                        <div className="space-y-6">
                            <section className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg shadow-md">
                                <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Ghi Sổ Mới</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <input value={voucherNumber} readOnly placeholder="Số CT" className="w-full p-2 border border-gray-300 rounded-md bg-gray-200 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-300 focus:outline-none"/>
                                    <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Tên sản phẩm*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    <div className="relative">
                                        <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="ĐVT*" className="w-full p-2 pr-24 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                        <button onClick={handleSuggestUnit} disabled={isSuggestingUnit || !productName} className="absolute right-1 top-1/2 -translate-y-1/2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold py-1 px-2 rounded-md disabled:opacity-50 transition-colors duration-200">
                                            {isSuggestingUnit ? '...' : 'AI Gợi ý'}
                                        </button>
                                    </div>
                                    <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="Đơn giá*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    <input type="number" value={quantityIn} onChange={e => setQuantityIn(e.target.value)} placeholder="SL Nhập" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    <input type="number" value={quantityOut} onChange={e => setQuantityOut(e.target.value)} placeholder="SL Xuất" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    <p className="text-sm p-2 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-800 dark:text-gray-200">TT Nhập: <span className="font-bold">{formatNumber(amountIn)}</span></p>
                                    <p className="text-sm p-2 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-800 dark:text-gray-200">TT Xuất: <span className="font-bold">{formatNumber(amountOut)}</span></p>
                                </div>
                                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 mt-4">
                                    <button onClick={handleAddLedgerEntry} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow-lg">Thêm Bút Toán</button>
                                    <button onClick={handleExportLedger} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow-lg">Xuất CSV</button>
                                </div>
                            </section>
                            
                            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg">
                                <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                        <tr>
                                            <th scope="col" className="px-4 py-3">Ngày</th>
                                            <th scope="col" className="px-4 py-3">Sản phẩm</th>
                                            <th scope="col" className="px-4 py-3 text-right">ĐG</th>
                                            <th scope="col" className="px-4 py-3 text-right">SL Nhập</th>
                                            <th scope="col" className="px-4 py-3 text-right">SL Xuất</th>
                                            <th scope="col" className="px-4 py-3">Ghi chú</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledgerEntries.map(entry => (
                                            <tr key={entry.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                                <td className="px-4 py-2">{entry.entryDate}</td>
                                                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{entry.productName}</td>
                                                <td className="px-4 py-2 text-right">{formatNumber(entry.unitPrice)}</td>
                                                <td className="px-4 py-2 text-right text-green-500">{entry.quantityIn > 0 ? formatNumber(entry.quantityIn) : ''}</td>
                                                <td className="px-4 py-2 text-right text-red-500">{entry.quantityOut > 0 ? formatNumber(entry.quantityOut) : ''}</td>
                                                <td className="px-4 py-2">{entry.note}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* VIEW: STOCK CHECK */}
                    {/* CHẾ ĐỘ XEM: KIỂM KHO */}
                    {view === 'stockCheck' && (
                           <div className="space-y-6">
                                <section className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg shadow-md">
                                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
                                        {editingItemId ? 'Cập Nhật Thông Tin Mặt Hàng' : 'Thêm Mặt Hàng Mới (Định nghĩa)'}
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Tên mặt hàng*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" readOnly={editingItemId !== null}/> {/* Item name is read-only when editing */}
                                            <input value={unitOfMeasure} onChange={e => setUnitOfMeasure(e.target.value)} placeholder="ĐVT*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                            <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="Giá vốn*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                            <input type="number" value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)} placeholder="Ngưỡng báo tồn kho*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    </div>
                                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 mt-4">
                                        <button onClick={handleSubmitInventoryItem} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow-lg">
                                            {editingItemId ? 'Cập Nhật Mặt Hàng' : 'Thêm Mặt Hàng'}
                                        </button>
                                        {editingItemId && (
                                            <button onClick={handleCancelEdit} className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow-lg">
                                                Hủy
                                            </button>
                                        )}
                                    </div>
                                </section>

                                <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg">
                                    <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                            <tr>
                                                <th scope="col" className="px-6 py-3">Tên mặt hàng</th>
                                                <th scope="col" className="px-6 py-3 text-right">Số lượng tồn</th>
                                                <th scope="col" className="px-6 py-3">ĐVT</th>
                                                <th scope="col" className="px-6 py-3 text-right">Giá vốn</th>
                                                <th scope="col" className="px-6 py-3 text-center">Trạng thái</th>
                                                <th scope="col" className="px-6 py-3 text-center">Thao tác</th> {/* New column for actions */}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventoryItems.map(item => (
                                                <tr key={item.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{item.name}</td>
                                                    <td className="px-6 py-4 text-right font-bold">{formatNumber(item.quantity)}</td>
                                                    <td className="px-6 py-4">{item.unit}</td>
                                                    <td className="px-6 py-4 text-right">{formatNumber(item.cost)}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        {item.quantity <= item.threshold ? 
                                                            <span className="px-2 py-1 font-semibold text-xs bg-red-200 text-red-800 rounded-full">Hết hàng</span> :
                                                            <span className="px-2 py-1 font-semibold text-xs bg-green-200 text-green-800 rounded-full">Còn hàng</span>
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex justify-center space-x-2">
                                                            <button onClick={() => handleEditItem(item)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold">Sửa</button>
                                                            <button onClick={() => handleDeleteItem(item.id, item.name)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 font-semibold">Xóa</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                           </div>
                    )}
                    
                    {/* VIEW: EXPENSE LEDGER */}
                    {/* CHẾ ĐỘ XEM: SỔ CHI PHÍ */}
                    {view === 'expenseLedger' && (
                           <div className="space-y-6">
                                <section className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg shadow-md">
                                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Ghi Nhận Chi Phí Mới</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                           <input value={expenseVoucherNumber} readOnly placeholder="Số CT" className="w-full p-2 border border-gray-300 rounded-md bg-gray-200 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-300 focus:outline-none"/>
                                           <input type="date" value={expenseEntryDate} onChange={e => setExpenseEntryDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                           <select value={expenseType} onChange={e => setExpenseType(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                                               {expenseCategories.map(cat => <option key={cat} value={cat}>{cat || "Chọn loại chi phí*"}</option>)}
                                           </select>
                                           <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Diễn giải*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:col-span-2 lg:col-span-1"/>
                                           <input type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="Tổng số tiền*" className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
                                    </div>
                                    <button onClick={handleAddExpenseEntry} className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow-lg">Thêm Chi Phí</button>
                                </section>

                                <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg">
                                    <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                            <tr>
                                                <th scope="col" className="px-6 py-3">Ngày</th>
                                                <th scope="col" className="px-6 py-3">Loại chi phí</th>
                                                <th scope="col" className="px-6 py-3">Diễn giải</th>
                                                <th scope="col" className="px-6 py-3 text-right">Số tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expenseEntries.map(expense => (
                                                <tr key={expense.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                                    <td className="px-6 py-4">{expense.expenseEntryDate}</td>
                                                    <td className="px-6 py-4">{expense.expenseType}</td>
                                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{expense.description}</td>
                                                    <td className="px-6 py-4 text-right font-bold">{formatNumber(expense.totalAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                           </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;