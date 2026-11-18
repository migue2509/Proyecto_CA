# 1. Imagen base oficial de Python 3.12, versión liviana
FROM python:3.12-slim

# 2. Carpeta de trabajo
WORKDIR /app

# 3. Primero solo las dependencias: esta capa queda en caché y no se
#    reinstala cada vez que cambia el código o el frontend.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Código, frontend y modelo
COPY app/ ./app/
COPY frontend/ ./frontend/
COPY models/ ./models/

# 5. Puerto del servicio
EXPOSE 8000

# 6. Arranque. 0.0.0.0 para aceptar conexiones desde fuera del contenedor.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
