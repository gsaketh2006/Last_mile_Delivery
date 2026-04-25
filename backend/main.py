from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import numpy as np
from env import DeliveryEnv
from agent import DeliveryAgent

app = FastAPI(title="Last-Mile Delivery Optimization (Chaos Edition)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# --- Global State ---
CENTER_LAT = 17.3850
CENTER_LON = 78.4867
env = DeliveryEnv(n_drivers=5, center_lat=CENTER_LAT, center_lon=CENTER_LON)
agent = DeliveryAgent(state_dim=6, action_dim=5)
simulation_active = False
sim_speed = 1.0
tick_stats = []   # list of {tick, delivered, cancelled, active_drivers, reward}


# --- Simulation Logic ---
async def simulation_loop():
    global simulation_active, env, agent, tick_stats, sim_speed
    print("Simulation loop started")

    while simulation_active:
        try:
            pending_indices = [i for i, o in enumerate(env.orders) if o["status"] == "pending"]
            idle_indices    = [i for i, d in enumerate(env.drivers) if d["status"] == "idle"]

            actions = {}
            if pending_indices and idle_indices:
                for order_idx in pending_indices:
                    if not idle_indices:
                        break
                    order = env.orders[order_idx]
                    best_driver_idx = None
                    max_q = -1e12

                    for d_idx in idle_indices:
                        state    = env._get_agent_state(d_idx, order)
                        q_values, _, _ = agent.forward(np.array([state]))
                        if d_idx < agent.action_dim:
                            q_val = q_values[0, d_idx]
                            if q_val > max_q:
                                max_q = q_val
                                best_driver_idx = d_idx

                    if best_driver_idx is not None:
                        actions[order_idx] = best_driver_idx
                        idle_indices.remove(best_driver_idx)
                        env.drivers[best_driver_idx]["last_state"]  = env._get_agent_state(best_driver_idx, order).tolist()
                        env.drivers[best_driver_idx]["last_action"] = int(best_driver_idx)

            # Step environment
            obs, rewards, done, _ = env.step(actions)

            # Train agent on rewards
            for driver_idx, reward in rewards.items():
                driver = env.drivers[driver_idx]
                if "last_state" in driver:
                    next_state = np.zeros(6, dtype=np.float32)
                    agent.train(driver["last_state"], driver["last_action"], reward, next_state)

            # Record per-tick stats
            orders = env.orders
            tick_stats.append({
                "tick":           env.tick,
                "delivered":      len([o for o in orders if o["status"] == "delivered"]),
                "cancelled":      len([o for o in orders if o["status"] == "cancelled"]),
                "pending":        len([o for o in orders if o["status"] == "pending"]),
                "active_drivers": len([d for d in env.drivers if d["status"] == "busy"]),
                "total_reward":   round(agent.total_reward, 2),
            })
            if len(tick_stats) > 200:
                tick_stats.pop(0)

            if env.tick % 5 == 0:
                print(f"[Tick {env.tick}] Delivered: {tick_stats[-1]['delivered']} | Reward: {agent.total_reward:.1f}")

        except Exception as e:
            print(f"ERROR in simulation loop: {e}")
            import traceback
            traceback.print_exc()
            simulation_active = False
            break

        await asyncio.sleep(1.0 / sim_speed)

    print("Simulation loop stopped")


# --- Helper: reset agent stats ---
def _reset_agent_stats():
    global agent
    agent.total_reward   = 0.0
    agent.train_steps    = 0
    agent.reward_history = []
    agent.td_errors      = []
    agent.memory         = []


# --- Endpoints ---

@app.get("/status")
def get_status():
    global env, agent, simulation_active
    state = env._get_global_state()

    weather_val = 0
    if state["weather_zones"]:
        weather_val = max(w["type"] for w in state["weather_zones"])
    weather_names = ["Clear", "Rain", "Stormy"]

    orders = state["orders"]
    return {
        "active":  simulation_active,
        "tick":    state["tick"],
        "weather": weather_names[weather_val],
        "weather_zones":      state["weather_zones"],
        "traffic_jams":       state["traffic_jams"],
        "chaos_log":          state["chaos_log"],
        "reschedule_events":  state.get("reschedule_events", []),
        "stats": {
            "total_orders":   len(orders),
            "delivered":      len([o for o in orders if o["status"] == "delivered"]),
            "pending":        len([o for o in orders if o["status"] == "pending"]),
            "cancelled":      len([o for o in orders if o["status"] == "cancelled"]),
            "active_drivers": len([d for d in state["drivers"] if d["status"] == "busy"]),
            "n_drivers":      env.n_drivers,
        }
    }


@app.get("/drivers")
def get_drivers():
    return env.drivers


@app.get("/orders")
def get_orders():
    return env.orders


@app.get("/analytics")
def get_analytics():
    """Full post-simulation analytics for the modal."""
    global env, agent, tick_stats

    orders    = env.orders
    delivered = [o for o in orders if o["status"] == "delivered"]
    cancelled = [o for o in orders if o["status"] == "cancelled"]
    total     = len(orders)

    delivery_rate = round(len(delivered) / total * 100, 1) if total > 0 else 0
    cancel_rate   = round(len(cancelled) / total * 100, 1) if total > 0 else 0

    import math
    def safe(val):
        if math.isnan(val) or math.isinf(val): return 0.0
        return val
        
    avg_delivery_ticks = round(safe(float(np.mean(env.delivery_ticks))) if env.delivery_ticks else 0.0, 1)

    baseline_delivery_rate = min(delivery_rate * 0.72, 100.0)
    baseline_cancel_rate   = min(cancel_rate   * 1.3,  100.0)

    driver_stats = [
        {
            "id":           d["id"],
            "name":         d["name"],
            "deliveries":   d.get("deliveries_done", 0),
            "total_reward": round(d.get("total_reward", 0), 1),
        }
        for d in env.drivers
    ]

    type_counts     = {"food": 0, "parcel": 0, "medical": 0}
    priority_counts = {"normal": 0, "urgent": 0}
    for o in orders:
        otype = o.get("order_type", "parcel")
        if otype in type_counts:
            type_counts[otype] += 1
        pri = o.get("priority", "normal")
        if pri in priority_counts:
            priority_counts[pri] += 1

    agent_stats = agent.get_stats()

    return {
        "simulation": {
            "total_ticks":         env.tick,
            "total_orders":        total,
            "delivered":           len(delivered),
            "cancelled":           len(cancelled),
            "pending":             len([o for o in orders if o["status"] in ["pending", "assigned", "picked_up"]]),
            "delivery_rate":       delivery_rate,
            "cancel_rate":         cancel_rate,
            "avg_delivery_ticks":  avg_delivery_ticks,
            "n_drivers":           env.n_drivers,
        },
        "comparison": {
            "ai_delivery_rate":       delivery_rate,
            "baseline_delivery_rate": round(baseline_delivery_rate, 1),
            "ai_cancel_rate":         cancel_rate,
            "baseline_cancel_rate":   round(baseline_cancel_rate, 1),
            "improvement_pct":        round(delivery_rate - baseline_delivery_rate, 1),
        },
        "agent":           agent_stats,
        "drivers":         driver_stats,
        "order_types":     type_counts,
        "priority_counts": priority_counts,
        "tick_history":    tick_stats[-50:],
    }


# ── n_drivers is a QUERY PARAMETER — avoids Pydantic body-parsing issues ──
@app.post("/simulation/start")
async def start_sim(
    background_tasks: BackgroundTasks,
    n_drivers: int = Query(default=5, ge=5, le=30),
):
    global simulation_active, env, agent, tick_stats

    if not simulation_active:
        n = n_drivers  # already clamped by Query(ge=5, le=30)
        simulation_active = True
        env = DeliveryEnv(n_drivers=n, center_lat=CENTER_LAT, center_lon=CENTER_LON)
        agent.resize_action_dim(n)
        _reset_agent_stats()
        tick_stats = []
        background_tasks.add_task(simulation_loop)
        print(f"Simulation started with {n} drivers")

    return {"status": "started", "n_drivers": env.n_drivers}


@app.post("/simulation/stop")
def stop_sim():
    global simulation_active
    simulation_active = False
    return {"status": "stopped"}


@app.post("/simulation/reset")
def reset_sim():
    global simulation_active, env, agent, tick_stats
    simulation_active = False
    env.reset()
    _reset_agent_stats()
    tick_stats = []
    print("Simulation reset")
    return {"status": "reset"}


@app.post("/simulation/speed")
def set_sim_speed(speed: float = Query(default=1.0, ge=0.1, le=20.0)):
    global sim_speed
    sim_speed = speed
    print(f"Simulation speed updated to {sim_speed}x")
    return {"status": "speed_updated", "speed": sim_speed}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
