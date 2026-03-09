'use server'

import OpenAI from 'openai'
const pdf = require('pdf-extraction')

export async function processDocumentWithOCR(imageUrl: string) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('--- OCR ERROR: OPENAI_API_KEY NO DETECTADA ---');
        return { success: false, error: 'API Key missing' }
    }

    const client = new OpenAI({ apiKey });

    try {
        console.log('--- OCR: DESCARGANDO ARCHIVO ---');
        const responseFile = await fetch(imageUrl);
        if (!responseFile.ok) throw new Error('No se pudo descargar el archivo de Supabase');

        const blob = await responseFile.blob();
        const contentType = blob.type || '';

        console.log('Tipo de archivo detectado:', contentType);

        const arrayBuffer = await blob.arrayBuffer(); // Moved this line up as it's used by both branches

        if (contentType.includes('pdf')) {
            console.log('--- OCR: PROCESANDO PDF (TEXTO) ---');
            const dataBuffer = Buffer.from(arrayBuffer);
            const pdfData = await pdf(dataBuffer);
            const extractedText = pdfData.text;

            if (!extractedText || extractedText.trim().length < 10) {
                return {
                    success: false,
                    error: 'El PDF parece estar vacío o escaneado como imagen. Por ahora, para PDFs escaneados, por favor sube una imagen (captura de pantalla o foto).'
                };
            }

            const systemPrompt = `Extrae información estructurada de este documento ERP (Presupuesto, Albarán, Factura o Gasto).
            
            REQUISITO DE MÁXIMA PRIORIDAD: **Concepto/Descripción**
            Localiza el cuerpo central del documento (entre el encabezado y los totales).
            - Captura el TEXTO que describe el trabajo, servicio o material.
            - **REGLA DE LONGITUD**: Si hay mucho texto o muchas líneas de detalle, haz un RESUMEN CON SENTIDO que permita entender de qué trata el documento sin que sea excesivamente largo.
            - Si es corto, captúralo tal cual. 
            - NO omitas información técnica crítica, pero evita redundancias.
            - Si hay varias líneas, únelas con " | ".
            - Es vital que el usuario entienda el propósito del documento de un vistazo.

            Otros requisitos de extracción:
            1. **Número de Documento**: Identificador principal (Ej: 'Factura nº 123', 'Albarán 50').
            2. **Nº Pedido/Nº Solicitud/Ref**: Solo números de pedido (450000), códigos OCC, o referencias de proyecto. Deja VACÍO si no hay una referencia clara del cliente. NUNCA pongas aquí el número del documento.
            3. **Datos Financieros**: Extrae Base Imponible, IVA (porcentaje e importe) y Total.
            4. **Fecha**: Formato ISO (YYYY-MM-DD).
            5. **Identidad**: Razón social y CIF de emisor y receptor.

            RESPONDE SOLO EN JSON:
            - proveedor: Nombre emisor.
            - proveedor_cif: CIF emisor.
            - fecha: YYYY-MM-DD.
            - numero: Nº real del documento.
            - concepto: Descripción DETALLADA y COMPLETA (Campo más importante).
            - numero_pedido_ref: Pedido/Ref (o vacío).
            - base_imponible: Número.
            - iva_porcentaje: Número (ej: 21).
            - iva_importe: Número.
            - total: Número.`;

            console.log('--- OCR: ENVIANDO TEXTO EXTRAÍDO A IA ---');
            const aiResponse = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: extractedText }
                ],
                response_format: { type: "json_object" }
            });

            const content = aiResponse.choices[0].message.content;
            if (!content) throw new Error('Respuesta vacía de la IA');
            const jsonData = JSON.parse(content);
            return { success: true, data: jsonData, text: extractedText };
        }

        // --- FLUJO PARA IMÁGENES ---
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64Image}`;

        console.log('--- OCR: ENVIANDO IMAGEN A OPENAI (VISIÓN) ---');

        const systemPrompt = `Extrae información estructurada de este documento ERP (Presupuesto, Albarán, Factura o Gasto).

        OBJETIVO PRINCIPAL: **Concepto/Descripción** (Campo: 'concepto')
        - Este es el campo MÁS IMPORTANTE.
        - Busca la columna "DESCRIPCION", "CONCEPTO" o el cuerpo central del documento.
        - Extrae el texto COMPLETO de la descripción de la línea principal.
        - Ejemplo: Si dice "erp prueba de nuevo", DEBES extraer "erp prueba de nuevo".
        - Si hay varias líneas, resume inteligentemente o únelas con " | ".
        - NO omitas el contenido principal. Si la descripción es larga, CAPTURA LO ESENCIAL.

        Otros requisitos:
        1. **Número de Documento**: (Ej: 'Factura nº 123', 'Albarán 50'). ES OBLIGATORIO. Si no lo encuentras, busca cerca de la fecha o arriba a la derecha. NO inventes.
        2. **Nº Pedido/Ref**: (Ej: '450000', 'erp'). NUNCA pongas aquí el número del documento.
        3. **Importes**: Base, IVA, Total.
        4. **Fecha**: YYYY-MM-DD.
        5. **Proveedor**: Nombre del emisor.

        JSON FORMAT:
        - numero: String (Número del documento, ej: "A23-999")
        - fecha: String (YYYY-MM-DD)
        - proveedor: String
        - proveedor_cif: String
        - concepto: String (LA DESCRIPCIÓN DEL NOTA/FACTURA)
        - numero_pedido_ref: String
        - base_imponible: Number
        - iva_porcentaje: Number
        - iva_importe: Number
        - total: Number
        - raw_text: String (TRANSCRIPCIÓN COMPLETA O RESUMEN DETALLADO DEL TEXTO VISIBLE EN LA IMAGEN)`;

        const aiResponse = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extrae los datos de esta imagen." },
                        { type: "image_url", image_url: { url: dataUrl } },
                    ],
                },
            ],
            response_format: { type: "json_object" },
            max_tokens: 1000,
        });

        const content = aiResponse.choices[0].message.content;
        console.log('--- OCR: RESULTADO ---');
        console.log(content);

        if (!content) throw new Error('Respuesta vacía de la IA');

        const jsonData = JSON.parse(content);
        return { success: true, data: jsonData, text: jsonData.raw_text || jsonData.concepto };

    } catch (error: any) {
        console.error('--- OCR: ERROR CRÍTICO ---');
        console.error(error);
        return { success: false, error: error.message || 'Error procesando documento' };
    }
}
