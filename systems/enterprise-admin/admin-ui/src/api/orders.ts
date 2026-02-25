import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface OrderItem {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    product?: {
        name: string;
        sku: string;
    };
}

export interface Order {
    id: string;
    customerId: string;
    status: string;
    totalAmount: number;
    paymentStatus: string;
    shippingAddress?: string;
    createdAt: string;
    customer?: {
        name: string;
        phone: string;
    };
    _count?: {
        items: number;
    };
    items?: OrderItem[];
}

export const ordersApi = {
    getOrders: async (filters: { customerId?: string; status?: string } = {}) => {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/orders`, {
            params: filters,
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    getOrderById: async (id: string) => {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    createOrder: async (data: any) => {
        const token = localStorage.getItem('token');
        const res = await axios.post(`${API_URL}/orders`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    updateStatus: async (id: string, status: string) => {
        const token = localStorage.getItem('token');
        const res = await axios.patch(`${API_URL}/orders/${id}/status`, { status }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    }
};
