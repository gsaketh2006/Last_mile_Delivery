import random
import time
import numpy as np
from typing import List, Dict, Tuple
from services.osrm import get_route

ORDER_TYPES = ["food", "parcel", "medical"]
ORDER_TYPE_COLORS = {"food": "🍔", "parcel": "📦", "medical": "💊"}

class DeliveryEnv:
    def __init__(self, n_drivers=5, center_lat=17.3850, center_lon=78.4867):
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.n_drivers = n_drivers
        self.reset()

    def reset(self):
        self.drivers = [
            {
                "id": f"D{i}",
                "name": f"Driver {i}",
                "lat": self.center_lat + (random.random() - 0.5) * 0.05,
                "lon": self.center_lon + (random.random() - 0.5) * 0.05,
                "status": "idle",
                "target_id": None,
                "route": [],
                "eta": 0,
                "reroute_cooldown": 0,
                "picked_flag": 0,
                "deliveries_done": 0,
                "total_reward": 0.0,
            } for i in range(1, self.n_drivers + 1)
        ]
        self.orders = []
        self.tick = 0
        self.weather_zones = []
        self.traffic_jams = []
        self.chaos_log = ["🚀 Environment initialized. Simulation ready."]
        self.delivery_ticks = []        # list of tick-counts per delivery
        self.reschedule_events = []     # list of reschedule dicts for frontend toasts
        return self._get_global_state()

    def _get_global_state(self):
        return {
            "tick": self.tick,
            "weather_zones": self.weather_zones,
            "traffic_jams": self.traffic_jams,
            "drivers": self.drivers,
            "orders": self.orders,
            "chaos_log": self.chaos_log[-50:],
            "reschedule_events": self.reschedule_events[-10:],
        }

    def _get_agent_state(self, driver_idx, order):
        driver = self.drivers[driver_idx]

        local_traffic = 0.0
        for jam in self.traffic_jams:
            dist = ((driver["lat"] - jam["lat"])**2 + (driver["lon"] - jam["lon"])**2)**0.5
            if dist < jam["radius"]:
                local_traffic = max(local_traffic, jam["penalty"])

        nearby_count = 0
        for i, other in enumerate(self.drivers):
            if i == driver_idx: continue
            dist = ((driver["lat"] - other["lat"])**2 + (driver["lon"] - other["lon"])**2)**0.5
            if dist < 0.005:
                nearby_count += 1
        congestion_val = min(nearby_count / 3.0, 1.0)

        local_weather = 0.0
        for w in self.weather_zones:
            dist = ((driver["lat"] - w["lat"])**2 + (driver["lon"] - w["lon"])**2)**0.5
            if dist < w["radius"]:
                local_weather = max(local_weather, float(w["type"]))

        target_lat = order["pickup"]["lat"] if driver["picked_flag"] == 0 else order["dropoff"]["lat"]
        target_lon = order["pickup"]["lon"] if driver["picked_flag"] == 0 else order["dropoff"]["lon"]

        state = np.array([
            (target_lat - driver["lat"]) / 0.1,
            (target_lon - driver["lon"]) / 0.1,
            local_traffic,
            local_weather,
            congestion_val,
            float(driver["picked_flag"])
        ], dtype=np.float32)

        return state

    def step(self, actions: Dict[int, int]):
        self.tick += 1
        rewards = {}
        self.reschedule_events = []  # reset per-tick

        # 1. Dynamic environment updates
        self._update_chaos()

        # 2. Process assignments
        for order_idx, driver_idx in actions.items():
            order = self.orders[order_idx]
            driver = self.drivers[driver_idx]

            if driver["status"] != "idle": continue

            driver["status"] = "busy"
            driver["target_id"] = order["id"]
            driver["picked_flag"] = 0
            order["status"] = "assigned"
            order["assign_tick"] = self.tick

            route_data = get_route(driver["lat"], driver["lon"], order["pickup"]["lat"], order["pickup"]["lon"])
            if route_data:
                driver["route"] = route_data["geometry"]
                driver["eta"] = route_data["duration"]
                if route_data.get("fallback"):
                    self.chaos_log.append(f"⚠️ OSRM Fail: Driver {driver['id']} using fallback to {order['id']}")
                else:
                    emoji = ORDER_TYPE_COLORS.get(order.get("order_type", "parcel"), "📦")
                    self.chaos_log.append(f"✅ Assigned: {driver['name']} → {emoji} Order {order['id']} ({order.get('order_type','parcel')})")
            else:
                rewards[driver_idx] = -10
                driver["status"] = "idle"
                order["status"] = "pending"

        # 3. Move agents
        for i, driver in enumerate(self.drivers):
            if driver["status"] == "busy":
                order = next((o for o in self.orders if o["id"] == driver["target_id"]), None)
                if not order: continue
                reward = self._move_driver(i, driver, order)
                if reward != 0:
                    rewards[i] = rewards.get(i, 0) + reward
                    driver["total_reward"] = driver.get("total_reward", 0) + reward

        # 4. Random order generation
        self._generate_orders()

        # 5. Cancellations with rescheduling notifications
        self._handle_cancellations()

        return self._get_global_state(), rewards, False, {}

    def _update_chaos(self):
        if random.random() < 0.05 and len(self.weather_zones) < 3:
            w_type = random.choice([1, 2])
            zone = {
                "id": f"W{len(self.weather_zones)+1}{self.tick}",
                "lat": self.center_lat + (random.random() - 0.5) * 0.15,
                "lon": self.center_lon + (random.random() - 0.5) * 0.15,
                "radius": random.uniform(0.02, 0.05),
                "type": w_type,
                "expires": self.tick + random.randint(30, 80)
            }
            self.weather_zones.append(zone)
            names = {1: "Rain", 2: "Storm"}
            self.chaos_log.append(f"🌦️ {names[w_type]} formed at [{zone['lat']:.3f}, {zone['lon']:.3f}]")

        self.weather_zones = [w for w in self.weather_zones if w["expires"] > self.tick]

        if random.random() < 0.08:
            jam = {
                "id": f"J{len(self.traffic_jams)+1}",
                "lat": self.center_lat + (random.random() - 0.5) * 0.1,
                "lon": self.center_lon + (random.random() - 0.5) * 0.1,
                "radius": 0.012,
                "penalty": random.uniform(0.3, 0.7),
                "expires": self.tick + random.randint(15, 40)
            }
            self.traffic_jams.append(jam)
            self.chaos_log.append(f"🚦 Traffic spike at [{jam['lat']:.3f}, {jam['lon']:.3f}] — {int((1-jam['penalty'])*100)}% slowdown")

        self.traffic_jams = [j for j in self.traffic_jams if j["expires"] > self.tick]

    def _move_driver(self, idx, driver, order):
        local_weather = 0
        for w in self.weather_zones:
            dist = ((driver["lat"] - w["lat"])**2 + (driver["lon"] - w["lon"])**2)**0.5
            if dist < w["radius"]:
                local_weather = max(local_weather, w["type"])

        if local_weather == 2:
            if random.random() < 0.7:
                self.chaos_log.append(f"⛈️ {driver['name']} stalled by local storm")
                return -3

        base_speed = 2.5
        speed_mult = 1.0
        if local_weather == 1: speed_mult *= 0.6
        if local_weather == 2: speed_mult *= 0.3

        in_traffic = False
        for jam in self.traffic_jams:
            dist = ((driver["lat"] - jam["lat"])**2 + (driver["lon"] - jam["lon"])**2)**0.5
            if dist < jam["radius"]:
                speed_mult *= jam["penalty"]
                in_traffic = True

        nearby_agents = 0
        for j, other in enumerate(self.drivers):
            if idx == j: continue
            dist = ((driver["lat"] - other["lat"])**2 + (driver["lon"] - other["lon"])**2)**0.5
            if dist < 0.002:
                nearby_agents += 1

        congestion_penalty = 0
        if nearby_agents > 0:
            speed_mult *= (0.8 ** nearby_agents)
            congestion_penalty = -2

        actual_speed = base_speed * speed_mult
        steps = int(actual_speed) if actual_speed >= 1 else (1 if random.random() < actual_speed else 0)

        for _ in range(steps):
            if driver["route"]:
                next_pt = driver["route"].pop(0)
                driver["lon"], driver["lat"] = next_pt[0], next_pt[1]
            else:
                if order["status"] == "assigned":
                    order["status"] = "picked_up"
                    driver["picked_flag"] = 1
                    route_data = get_route(driver["lat"], driver["lon"], order["dropoff"]["lat"], order["dropoff"]["lon"])
                    if route_data:
                        driver["route"] = route_data["geometry"]
                        driver["eta"] = route_data["duration"]
                        if route_data.get("fallback"):
                            self.chaos_log.append(f"⚠️ Fallback route for delivery {order['id']}")
                    emoji = ORDER_TYPE_COLORS.get(order.get("order_type", "parcel"), "📦")
                    self.chaos_log.append(f"🤝 {driver['name']} picked up {emoji} Order {order['id']}")
                    return 15 # Increased pickup reward

                elif order["status"] == "picked_up":
                    order["status"] = "delivered"
                    driver["status"] = "idle"
                    driver["target_id"] = None
                    driver["picked_flag"] = 0
                    driver["deliveries_done"] = driver.get("deliveries_done", 0) + 1
                    # Track delivery ticks
                    assign_tick = order.get("assign_tick", self.tick)
                    self.delivery_ticks.append(self.tick - assign_tick)
                    emoji = ORDER_TYPE_COLORS.get(order.get("order_type", "parcel"), "📦")
                    self.chaos_log.append(f"🎉 {driver['name']} delivered {emoji} Order {order['id']}!")
                    return 50 # Strongly increased delivery reward

        # Delay Penalty if picked up (reduced to prevent overpowering rewards)
        if driver["picked_flag"] == 1:
            return -0.2 + congestion_penalty # Ongoing delay penalty + congestion
        
        return congestion_penalty

    def _generate_orders(self):
        # Slightly higher spawn rate for richer simulation
        if random.random() < 0.15 and len(self.orders) < 30:
            order_type = random.choice(ORDER_TYPES)
            priority = random.choice(["normal", "normal", "normal", "urgent"])
            new_order = {
                "id": f"O{len(self.orders)+1}",
                "order_type": order_type,
                "priority": priority,
                "pickup": {
                    "lat": self.center_lat + (random.random() - 0.5) * 0.1,
                    "lon": self.center_lon + (random.random() - 0.5) * 0.1
                },
                "dropoff": {
                    "lat": self.center_lat + (random.random() - 0.5) * 0.1,
                    "lon": self.center_lon + (random.random() - 0.5) * 0.1
                },
                "status": "pending",
                "start_time": time.time(),
                "assign_tick": None,
            }
            emoji = ORDER_TYPE_COLORS.get(order_type, "📦")
            self.chaos_log.append(f"📬 New {priority} {emoji} order: {new_order['id']} ({order_type})")
            self.orders.append(new_order)

    def _handle_cancellations(self):
        for order in self.orders:
            if order["status"] in ["pending", "assigned"] and random.random() < 0.005:
                old_status = order["status"]
                order["status"] = "pending"
                order["assign_tick"] = None
                self.chaos_log.append(f"⚠️ Order {order['id']} disrupted due to some reasons, rescheduling...")

                # Release driver and log rescheduling event
                for d in self.drivers:
                    if d["target_id"] == order["id"]:
                        old_driver_name = d["name"]
                        d["status"] = "idle"
                        d["target_id"] = None
                        d["route"] = []
                        d["picked_flag"] = 0
                        # Rescheduling notification
                        reschedule_msg = f"🔁 Order {order['id']} rescheduled — {old_driver_name} released & now available"
                        self.chaos_log.append(reschedule_msg)
                        self.reschedule_events.append({
                            "order_id": order["id"],
                            "driver": old_driver_name,
                            "tick": self.tick,
                            "message": reschedule_msg
                        })
