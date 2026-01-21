
import React, { useEffect, useState } from 'react';
import { User, Project } from '../types';
import { getProjectsByUser, deleteProject } from '../utils/db';

interface DashboardProps {
  user: User;
  onCreateNew: () => void;
  onEditProject: (project: Project) => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onCreateNew, onEditProject, onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, [user.id]);

  const loadProjects = async () => {
    setIsLoading(true);
    const data = await getProjectsByUser(user.id);
    setProjects(data);
    setIsLoading(false);
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      await deleteProject(projectId);
      loadProjects();
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
         <div>
            <h1 className="text-3xl font-mono font-bold text-white mb-1">
              COMMAND CENTER
            </h1>
            <p className="text-slate-400 text-sm">Welcome back, <span className="text-cyan-400">{user.username}</span></p>
         </div>
         <div className="flex gap-4">
             <button 
               onClick={onLogout}
               className="px-4 py-2 border border-slate-700 text-slate-400 hover:text-white rounded font-mono text-xs uppercase"
             >
               Logout
             </button>
             <button 
               onClick={onCreateNew}
               className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold rounded shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center gap-2"
             >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
               NEW PROJECT
             </button>
         </div>
      </div>

      {/* Grid */}
      {isLoading ? (
         <div className="flex justify-center py-20 text-cyan-500 animate-pulse font-mono">LOADING DATA...</div>
      ) : projects.length === 0 ? (
         <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-xl">
             <p className="text-slate-500 font-mono mb-4">NO ACTIVE PROJECTS DETECTED</p>
             <button onClick={onCreateNew} className="text-cyan-400 hover:underline text-sm font-mono">Initialize First Protocol</button>
         </div>
      ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {projects.map(project => (
               <div 
                 key={project.id}
                 onClick={() => onEditProject(project)}
                 className="group relative bg-slate-900 border border-slate-800 rounded-xl p-5 cursor-pointer hover:border-cyan-500/50 transition-all hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden"
               >
                 {/* Hover Glow */}
                 <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-purple-500/0 group-hover:from-cyan-500/5 group-hover:to-purple-500/5 transition-all duration-500"></div>

                 <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                           <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${project.agent.avatarColor} flex items-center justify-center shadow-lg`}>
                              <svg className="w-6 h-6 text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                           </div>
                           <div>
                              <h3 className="text-white font-bold font-mono truncate max-w-[150px]">{project.name || "Untitled Project"}</h3>
                              <p className="text-xs text-slate-500 font-mono">{project.agent.name}</p>
                           </div>
                        </div>
                        <button 
                           onClick={(e) => handleDelete(e, project.id)}
                           className="text-slate-600 hover:text-red-400 p-1"
                           title="Delete Project"
                        >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>

                    <div className="bg-slate-950 rounded p-3 mb-4 h-20 overflow-hidden relative">
                        <p className="text-slate-400 text-xs font-sans italic line-clamp-3">"{project.text || 'No script recorded yet...'}"</p>
                        <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-slate-950 to-transparent"></div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-t border-slate-800 pt-3">
                       <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                       <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {project.duration ? project.duration.toFixed(1) + 's' : '0s'}
                       </span>
                    </div>
                 </div>
               </div>
             ))}
         </div>
      )}
    </div>
  );
};
