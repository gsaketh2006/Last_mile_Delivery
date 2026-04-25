import numpy as np
import random

class DeliveryAgent:
    def __init__(self, state_dim=6, action_dim=5):
        self.state_dim = state_dim
        self.action_dim = action_dim

        # Simple MLP [Input -> 24 -> 16 -> Action]
        self.w1 = np.random.randn(state_dim, 24) / np.sqrt(state_dim)
        self.b1 = np.zeros((1, 24))
        self.w2 = np.random.randn(24, 16) / np.sqrt(24)
        self.b2 = np.zeros((1, 16))
        self.w3 = np.random.randn(16, action_dim) / np.sqrt(16)
        self.b3 = np.zeros((1, action_dim))

        # Hyperparameters
        self.gamma = 0.95
        self.epsilon = 0.1
        self.learning_rate = 0.01
        self.memory = []

        # Analytics tracking
        self.total_reward = 0.0
        self.reward_history = []      # cumulative reward per training step
        self.train_steps = 0
        self.td_errors = []           # track TD errors over time

        # Heuristic Bias
        self.w1[0:2, :] *= -0.5
        self.w1[2, :] *= -2.0
        self.w1[3, :] *= -1.5
        self.w1[4, :] *= -2.0
        self.w1[5, :] *= 1.0

    def resize_action_dim(self, new_dim):
        """Resize the output layer when driver count changes."""
        self.action_dim = new_dim
        self.w3 = np.random.randn(16, new_dim) / np.sqrt(16)
        self.b3 = np.zeros((1, new_dim))

    def forward(self, state):
        z1 = np.dot(state, self.w1) + self.b1
        a1 = np.maximum(0, z1)
        z2 = np.dot(a1, self.w2) + self.b2
        a2 = np.maximum(0, z2)
        q_values = np.dot(a2, self.w3) + self.b3
        return q_values, a1, a2

    def select_action(self, state, available_drivers):
        if not available_drivers:
            return None
        state_tensor = np.array([state])
        q_values, _, _ = self.forward(state_tensor)
        if random.random() < self.epsilon:
            return random.choice(available_drivers)
        valid_q = [q_values[0, i] if i in available_drivers else -1e12 for i in range(self.action_dim)]
        return np.argmax(valid_q)

    def train(self, state, action, reward, next_state):
        self.total_reward += reward
        self.train_steps += 1
        self.memory.append((state, action, reward, next_state))
        if len(self.memory) > 200:
            self.memory.pop(0)
        batch = random.sample(self.memory, min(len(self.memory), 8))
        for s, a, r, ns in batch:
            self._update_step(s, a, r, ns)
        # Sample reward history every 10 steps (keep last 100 points)
        if self.train_steps % 10 == 0:
            self.reward_history.append(round(self.total_reward, 2))
            if len(self.reward_history) > 100:
                self.reward_history.pop(0)

    def _update_step(self, state, action, reward, next_state):
        state_tensor = np.array([state])
        next_state_tensor = np.array([next_state])

        q_values, a1, a2 = self.forward(state_tensor)
        q_next, _, _ = self.forward(next_state_tensor)

        target = reward + self.gamma * np.max(q_next)
        td_error = target - q_values[0, action]

        # Track TD error
        self.td_errors.append(abs(float(td_error)))
        if len(self.td_errors) > 100:
            self.td_errors.pop(0)

        dq = np.zeros_like(q_values)
        dq[0, action] = -td_error

        dw3 = np.dot(a2.T, dq)
        db3 = dq
        da2 = np.dot(dq, self.w3.T)

        dz2 = da2 * (a2 > 0)
        dw2 = np.dot(a1.T, dz2)
        db2 = dz2
        da1 = np.dot(dz2, self.w2.T)

        dz1 = da1 * (a1 > 0)
        dw1 = np.dot(state_tensor.T, dz1)
        db1 = dz1

        self.w3 -= self.learning_rate * dw3
        self.b3 -= self.learning_rate * db3
        self.w2 -= self.learning_rate * dw2
        self.b2 -= self.learning_rate * db2
        self.w1 -= self.learning_rate * dw1
        self.b1 -= self.learning_rate * db1

    def get_stats(self):
        import math
        def safe(val):
            if math.isnan(val) or math.isinf(val): return 0.0
            return val
            
        return {
            "total_reward": round(safe(self.total_reward), 2),
            "train_steps": self.train_steps,
            "memory_size": len(self.memory),
            "epsilon": safe(self.epsilon),
            "learning_rate": safe(self.learning_rate),
            "gamma": safe(self.gamma),
            "reward_history": [safe(r) for r in self.reward_history],
            "avg_td_error": round(safe(float(np.mean(self.td_errors))) if self.td_errors else 0.0, 4),
        }
