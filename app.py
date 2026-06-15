from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/menu')
def menu():
    return render_template('menu.html')

@app.route('/api/menu')
def api_menu():
    return {
        "foods": [
            {"name": "Chicken Rice", "price": 5.50},
            {"name": "Nasi Lemak", "price": 4.50},
            {"name": "Burger", "price": 6.00}
        ]
    }

if __name__ == '__main__':
    app.run(debug=True)
