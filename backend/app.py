from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import base64

app = Flask(__name__)
CORS(app)

# Obter o caminho absoluto para o diretório de uploads
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@app.route('/upload', methods=['POST'])
def upload_file():
    data = request.json
    if not data or 'base64' not in data or 'fileName' not in data:
        return jsonify({'status': 'error', 'message': 'Invalid data format'}), 400

    try:
        file_data = base64.b64decode(data['base64'])

        # Sanitize filename to prevent Path Traversal
        file_name = secure_filename(data['fileName'])
        if not file_name:
            file_name = "unnamed_file"

        file_path = os.path.join(UPLOAD_FOLDER, file_name)

        with open(file_path, 'wb') as f:
            f.write(file_data)

        url = request.host_url + 'uploads/' + file_name

        return jsonify({'status': 'success', 'url': url})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    # secure_filename here as well for safety
    return send_from_directory(UPLOAD_FOLDER, secure_filename(filename))

if __name__ == '__main__':
    app.run(debug=True, port=5000)
