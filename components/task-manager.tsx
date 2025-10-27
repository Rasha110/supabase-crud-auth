"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase-client";
import { Session } from "@supabase/supabase-js";

interface Task {
  id: number;
  title: string;
  description: string;
  created_at: string;
  image_url: string;
  email:string;
}

function TaskManager({ session }: { session: Session }) {
  const [newTask, setNewTask] = useState({ title: "", description: "" });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingDescriptions, setEditingDescriptions] = useState<{ [key: number]: string }>({});
  const [taskImage, setTaskImage] = useState<File | null>(null);

  // Fetch tasks for the logged-in user
  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("email", session.user.email)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching tasks:", error.message);
      return;
    }
    setTasks(data);
  };

  // Add new task
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!newTask.title.trim() || !newTask.description.trim()) return;

    let imageUrl = "";

    if (taskImage) {
      // Clean filename
      const cleanName = taskImage.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const filePath = `${Date.now()}_${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from("tasks-images")
        .upload(filePath, taskImage);

      if (uploadError) {
        console.error("Error uploading image:", uploadError.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("tasks-images")
        .getPublicUrl(filePath);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...newTask, email: session.user.email, image_url: imageUrl })
      .select()
      .single();

    if (error) {
      console.error("Error adding task:", error.message);
      return;
    }

    setTasks(prev => [...prev, data]);
    setNewTask({ title: "", description: "" });
    setTaskImage(null);
  };

  // Delete task
  const deleteTask = async (id: number) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      console.error("Error deleting task:", error.message);
      return;
    }
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // Update task description
  const updateTask = async (id: number) => {
    const newDesc = editingDescriptions[id] ?? tasks.find(t => t.id === id)?.description;
  
    // If nothing changed, do nothing
    const currentDesc = tasks.find(t => t.id === id)?.description;
    if (newDesc === currentDesc) return;
  
    const { error, data } = await supabase
      .from("tasks")
      .update({ description: newDesc })
      .eq("id", id)
      .select()
      .single();
  
    if (error) {
      console.error("Error updating task:", error.message);
      return;
    }
  
    // Update local state
    setTasks(prev =>
      prev.map(task => (task.id === id ? { ...task, description: newDesc } : task))
    );
  
    // Clear the editing field
    setEditingDescriptions(prev => ({ ...prev, [id]: "" }));
  };
  
  
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setTaskImage(e.target.files[0]);
    }
  };

  // Fetch tasks on mount
  useEffect(() => {
    fetchTasks();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel("tasks-channel");
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload) => {
          const newTask = payload.new as Task;
          if (newTask.email === session.user.email) {
            setTasks(prev => [...prev, newTask]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload) => {
          const updatedTask = payload.new as Task;
          if (updatedTask.email === session.user.email) {
            setTasks(prev =>
              prev.map(t => (t.id === updatedTask.id ? updatedTask : t))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        (payload) => {
          const deletedTask = payload.old as Task;
          setTasks(prev => prev.filter(t => t.id !== deletedTask.id));
        }
      )
      .subscribe();
  }, []);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "1rem" }}>
      <h2>Task Manager CRUD</h2>

      <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Task Title"
          value={newTask.title}
          onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
          style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }}
        />
        <textarea
          placeholder="Task Description"
          value={newTask.description}
          onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
          style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }}
        />
        <input type="file" accept="image/*" onChange={handleFileChange} />
        <button type="submit" style={{ padding: "0.5rem 1rem", marginTop: "0.5rem" }}>
          Add Task
        </button>
      </form>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {tasks.map(task => (
          <li
            key={task.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "1rem",
              marginBottom: "0.5rem",
            }}
          >
            <h3>{task.title}</h3>
            <p>{task.description}</p>
            {task.image_url && <img src={task.image_url} style={{ height: 70 }} />}
            <div style={{ marginTop: "0.5rem" }}>
            <textarea
  placeholder="Updated description..."
  value={editingDescriptions[task.id] ?? task.description}
  onChange={e =>
    setEditingDescriptions(prev => ({ ...prev, [task.id]: e.target.value }))
  }
/>

              <button
                type="button"
                style={{ padding: "0.5rem 1rem", marginRight: "0.5rem" }}
                onClick={() => updateTask(task.id)}
              >
                Save
              </button>
              <button
                type="button"
                style={{ padding: "0.5rem 1rem" }}
                onClick={() => deleteTask(task.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TaskManager;
