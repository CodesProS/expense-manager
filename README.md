# Expense Manager

A mobile expense tracking application built with **React Native (Expo)** and **Supabase** that helps users manage their spending by scanning receipts, categorizing purchases, and analyzing expenses over time.

The app extracts items from receipts, organizes them into categories and tags, and visualizes spending trends to provide insights into personal finances.

---

## Features

- Track and manage daily expenses
- Upload receipts and automatically extract items
- Categorize purchases using tags and categories
- Edit and manage parsed receipt items
- View spending insights and analytics
- Cloud data storage with Supabase

---

## Tech Stack

### Frontend
- React Native
- Expo
- JavaScript / TypeScript

### Backend
- Supabase
- Supabase Edge Functions

### Tools & Libraries
- OpenAI API (for receipt parsing)
- Expo Image Picker
- React Native Chart Kit
- Supabase JS SDK

---

## Project Structure

```
expense-manager
│
├── app
│   └── (tabs)
│       ├── index.jsx
│       ├── explore.jsx
│       └── _layout.jsx
│
├── lib
│   └── supabase.js
│
├── supabase
│   └── functions
│
├── assets
│
├── README.md
└── package.json
```

---

## How It Works

1. A user uploads a receipt image from the mobile app.
2. The receipt is sent to a **Supabase Edge Function**.
3. The function processes the receipt and extracts purchase items.
4. Items are categorized and stored in the Supabase database.
5. The app displays expenses and analytics for the user.

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/CodesProS/expense-manager.git
cd expense-manager
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory.

Example:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
```

### 4. Start the development server

```bash
npx expo start
```

You can run the app using:

- Expo Go (mobile)
- Android Emulator
- iOS Simulator

---

## Future Improvements

- Budget tracking and spending limits
- Recurring expense support
- Monthly financial reports
- Improved receipt OCR accuracy
- AI-based expense categorization
- Multi-user support

---

## Screenshots

You can add screenshots of the application here.

Example:

```
screenshots/home.png
screenshots/analytics.png
screenshots/receipt.png
```

---

## License

This project is licensed under the **MIT License**.
