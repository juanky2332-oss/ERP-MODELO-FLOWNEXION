# Flownexion - ERP System

![Status](https://img.shields.io/badge/Status-Private%20Beta-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.1-black)
![Supabase](https://img.shields.io/badge/Supabase-Database-green)

Sistema de Gestión Integral (ERP) diseñado a medida para **Flownexion**, enfocado en la optimización de procesos administrativos, control de tesorería y gestión documental.

## 🚀 Características Principales

### 📑 Gestión Documental
- **Presupuestos**: Creación, seguimiento y conversión automática a albaranes.
- **Albaranes**: Control de entregas, firma digital y trazabilidad.
- **Facturas**: Generación automatizada, control de vencimientos e impuestos.
- **Gastos**: Registro y categorización de gastos operativos.

### 📊 Dashboard Financiero
- Visión global de la salud financiera en tiempo real.
- Gráficos de evolución de ingresos vs gastos.
- Indicadores clave de rendimiento (KPIs) mensuales.

### 🤖 Asistente IA (Wilson)
- Chatbot integrado para consultas rápidas sobre el estado del negocio.
- Capacidad de transcripción de voz a texto para notas rápidas.

### 📨 Comunicaciones
- Sistema de envío de correos electrónicos integrado.
- Trazabilidad de envíos y estados (Enviado, Leído, etc.).

## 🛠️ Stack Tecnológico

- **Frontend**: [Next.js 15](https://nextjs.org/) (App Router), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/).
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/), [Lucide React](https://lucide.dev/).
- **Backend / Database**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Storage).
- **AI Integration**: OpenAI (para el asistente inteligente).

## 📦 Instalación y Despliegue

### Requisitos Previos
- Node.js 18+
- Cuenta de Supabase configurada.

### Configuración Local

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/juanky2332-oss/ERP-WIL.git
    cd ERP-WIL
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    ```

3.  **Configurar variables de entorno**:
    Crea un archivo `.env.local` en la raíz del proyecto con las siguientes claves:

    ```env
    NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
    NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_supabase
    OPENAI_API_KEY=tu_api_key
    ```

4.  **Ejecutar servidor de desarrollo**:
    ```bash
    npm run dev
    ```

## 🔒 Seguridad y Privacidad

Este proyecto contiene información confidencial de negocio de **Flownexion**. Su uso y distribución están restringidos al personal autorizado.

---
Desarrollado con ❤️ por el equipo de ingeniería de Flownexion.
