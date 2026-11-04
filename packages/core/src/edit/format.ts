// The editor's format (A-02): which aspect the preview shows and the export pre-checks.
// Same contract as the other edits: pure, and the same reference back when nothing changes.
import { projectAspect, type Aspect, type Project } from '../project/schema.ts'

/** Sets the edit format; 16:9 is stored as no field, like files from before formats. */
export function setAspect(project: Project, aspect: Aspect): Project {
  if (projectAspect(project) === aspect) return project
  if (aspect === '16:9') {
    const { aspect: _dropped, ...rest } = project
    return rest
  }
  return { ...project, aspect }
}
