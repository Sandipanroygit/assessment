import type { CurriculumModule } from "@/types";

export const CURRICULUM_STORAGE_KEY = "admin-curriculum-rows";

export const defaultCurriculum: CurriculumModule[] = [
  {
    id: "c1",
    title: "Drone Mission Builder",
    grade: "Grade 8",
    subject: "Robotics",
    module: "Flight Path",
    description: "Plan waypoints, upload Python, and practice safe takeoff/landing.",
    assets: [
      { type: "video", url: "drone-mission.mp4", label: "Mission walkthrough" },
      { type: "code", url: "mission.py", label: "Python control" },
      { type: "doc", url: "mission-manual.pdf", label: "User manual" },
    ],
    codeSnippet: `# Simple hover routine
import drone

drone.arm()
drone.takeoff(1.5)
drone.hover(5)
drone.land()`,
  },
];
