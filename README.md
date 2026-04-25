# 🚚 Last-Mile Delivery Optimization with MARL

A high-performance, real-time simulation of last-mile delivery operations in Bangalore, India. This project leverages **Multi-Agent Reinforcement Learning (MARL)** to optimize driver-to-order assignments and **OSRM (Open Source Routing Machine)** for realistic navigation and traffic-aware ETAs.

---

## 🌟 Key Features

- **Dynamic Chaos Engine**: Real-time generation of order cancellations and localized traffic jams that disrupt planned routes.
- **Weather-Aware Simulation**: Weather shifts dynamically (Clear, Rain, Stormy), affecting both driver speed and agent decision-making.
- **Advanced MARL Dispatching**: A multi-agent RL agent using a Deep Q-Network (DQN) with experience replay to optimize deliveries under extreme uncertainty.
- **Real-time Rerouting**: Drivers automatically re-query OSRM for new paths if their current route is compromised by rising traffic or worsening weather.
- **Chaos Dashboard**: Interactive visualization of traffic "Hotspots" (red zones) and a live "Chaos Event Log".

---

## 🛠️ Technology Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **RL Agent**: Custom MLP Implementation with NumPy (Q-Learning)
- **Routing**: [OSRM API](http://project-osrm.org/)
- **Data Handling**: Pydantic for state models

### Frontend
- **Framework**: [Vite](https://vitejs.dev/) + [React](https://reactjs.org/)
- **Mapping**: [Leaflet](https://leafletjs.com/) via `react-leaflet`
- **Styling**: Vanilla CSS with modern aesthetics
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 🧠 Reinforcement Learning Approach

The system uses a **Centralized Agent** to handle high-level dispatching decisions.

### State Space
The agent perceives the environment through a 4D state vector:
1. **Latitude Offset**: Normalized distance from the city center.
2. **Longitude Offset**: Normalized distance from the city center.
3. **Weather Penalty**: A numerical value representing traversal difficulty (e.g., Stormy = 2.0).
4. **Availability Ratio**: Number of idle drivers relative to the total fleet.

### Reward Function
The agent is rewarded based on the **inverse of delivery time**:
$$Reward = \frac{100}{Time_{Delivered} + 1}$$
This encourages the agent to select drivers who are both closer to the pickup point and capable of navigating current weather conditions efficiently.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Node.js 18+

### Setup & Installation

#### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
The server will start at `http://localhost:8000`.

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The dashboard will be available at `http://localhost:5173`.

---

## 🗺️ Visualizing the Simulation

The map centers on **Bangalore, India** (`12.9716, 77.5946`). 

- **Blue Circles**: Represent Delivery Drivers.
- **Pink/Green Squares**: Represent Order Pickup and Dropoff points.
- **Dashed Lines**: Represent the active OSRM-calculated routes for busy drivers.

---

## 📁 Project Structure

```text
.
├── backend/
│   ├── agent.py          # Custom RL Agent (NumPy MLP)
│   ├── main.py           # FastAPI Server & Simulation Loop
│   ├── services/
│   │   └── osrm.py       # Routing & Distance Matrix Service
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── MapComponent.jsx  # Leaflet Implementation
│   │   ├── App.jsx       # Main Dashboard State
│   │   └── index.css     # Premium UI Styles
│   └── package.json
└── README.md             # This documentation
```
