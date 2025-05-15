import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        conn = pyodbc.connect(
            f'DRIVER={{ODBC Driver 18 for SQL Server}};'
            f'SERVER={os.getenv("DB_SERVER")};'
            f'DATABASE={os.getenv("DB_NAME")};'
            f'UID={os.getenv("DB_USER")};'
            f'PWD={os.getenv("DB_PASSWORD")};'
            'Trusted_Connection=no;'
            'TrustServerCertificate=yes;'
            'Encrypt=yes;'
        )
        return conn
    except pyodbc.Error as e:
        print(f"Error connecting to database: {str(e)}")
        print(f"Using connection string parameters:")
        print(f"Server: {os.getenv('DB_SERVER')}")
        print(f"Database: {os.getenv('DB_NAME')}")
        print(f"User: {os.getenv('DB_USER')}")
        raise

def get_production_units():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT UnitName FROM ProductRecordLogView ORDER BY UnitName")
    units = [row[0] for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return units

def get_production_data(unit_name, start_time, end_time):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT 
        Model,
        SUM(CASE WHEN TestSonucu = 1 THEN 1 ELSE 0 END) as SuccessQty,
        SUM(CASE WHEN TestSonucu = 0 THEN 1 ELSE 0 END) as FailQty,
        ModelSuresiSN as Target
    FROM 
        ProductRecordLogView
    WHERE 
        UnitName = ? 
        AND KayitTarihi BETWEEN ? AND ?
    GROUP BY 
        Model, ModelSuresiSN
    """
    
    cursor.execute(query, (unit_name, start_time, end_time))
    results = []
    for row in cursor.fetchall():
        model_data = {
            'model': row[0],
            'success_qty': row[1],
            'fail_qty': row[2],
            'target': row[3],
            'total_qty': row[1] + row[2],
            'quality': row[1] / (row[1] + row[2]) if (row[1] + row[2]) > 0 else 0
        }
        
        # Calculate performance only if target exists
        if row[3]:  # If ModelSuresiSN exists
            ideal_cycle_time = 3600 / row[3]
            operation_time = (end_time - start_time).total_seconds()
            model_data['performance'] = (model_data['total_qty'] * ideal_cycle_time) / operation_time if operation_time > 0 else 0
            model_data['oee'] = model_data['quality'] * model_data['performance']
        else:
            model_data['performance'] = None
            model_data['oee'] = None
            
        results.append(model_data)
    
    cursor.close()
    conn.close()
    return results 