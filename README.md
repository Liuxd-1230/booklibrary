# Lumina Reader

A modern, iOS 26-inspired e-reader web application built with React, Tailwind CSS, and AI integration.

## Features

### 📚 Smart Library
- **Drag & Drop Import**: Support for `.epub`, `.pdf`, `.md`, and `.txt` files.
- **AI Categorization**: Automatically organizes books into smart folders (e.g., Fiction, History, Tech) using Gemini AI.
- **Visual Grid**: iOS-style folder organization with blur effects and smooth animations.

### 📖 Immersive Reader
- **PDF & Text Support**: High-performance rendering for both structured PDF documents and flowing text.
- **Customizable**: Adjust font size, font family (Serif/Sans), line height, and themes (Light, Sepia, Dark).
- **Smooth Navigation**: Table of Contents (ToC) support for PDF and fast scrubbing.

### ✨ AI Integration
- **Text Explanation**: Select any text to get an instant AI-powered explanation, definition, or translation.
- **Dual Provider Support**:
  - **Google Gemini**: Default provider, fast and free.
  - **DeepSeek**: Compatible with DeepSeek (OpenAI-format) APIs. Configurable in Settings.

### 🚀 Performance
- **Lazy Loading**: PDFs render pages only when needed.
- **Debounced Rendering**: Optimized scroll performance avoids stuttering during fast page turns.
- **High DPI**: Sharp text rendering on Retina displays.

## Setup

1. This project is designed to run in a web environment.
2. The `API_KEY` environment variable should be set for Google Gemini features.
3. For DeepSeek support, users can enter their own API Key in the Reader Settings menu.

## Tech Stack
- React 19
- Tailwind CSS
- PDF.js
- Google GenAI SDK