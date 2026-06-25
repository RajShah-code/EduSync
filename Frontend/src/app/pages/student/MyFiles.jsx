import { useState } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Download, FileCode, FileText, Video } from "lucide-react";

// Mock data cleared - empty states shown
const mockSubmissions = [];
const mockLabMaterials = [];
const mockRecordings = [];

export function MyFiles() {
  const [activeTab, setActiveTab] = useState("submissions");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          My Files
        </h1>
        <p className="text-text-secondary">
          Access your submissions, lab materials, and session recordings
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-bg-surface border border-border">
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="materials">Lab Materials</TabsTrigger>
          <TabsTrigger value="recordings">Session Recordings</TabsTrigger>
        </TabsList>

        {/* Submissions */}
        <TabsContent value="submissions" className="mt-6">
          {mockSubmissions.length > 0 ? (
            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Session/Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockSubmissions.map((file) => (
                    <tr
                      key={file.id}
                      className="hover:bg-bg-elevated transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-text-primary">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-accent-info" />
                          {file.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs font-mono border border-border bg-bg-base rounded-sm text-text-secondary">
                          {file.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {file.session}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={file.status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-muted">
                        {file.size}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3 py-16">
              <FileCode className="w-12 h-12 text-text-muted" />
              <h3 className="text-base font-medium text-text-primary">
                No submissions yet
              </h3>
              <p className="text-sm text-text-secondary">
                Your coding task submissions will appear here.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Lab Materials */}
        <TabsContent value="materials" className="mt-6">
          {mockLabMaterials.length > 0 ? (
            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Uploaded By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockLabMaterials.map((file) => (
                    <tr
                      key={file.id}
                      className="hover:bg-bg-elevated transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-text-primary">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-accent-warning" />
                          {file.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs font-mono border border-border bg-bg-base rounded-sm text-text-secondary">
                          {file.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {file.uploadedBy}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-muted">
                        {file.size}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3 py-16">
              <FileText className="w-12 h-12 text-text-muted" />
              <h3 className="text-base font-medium text-text-primary">
                No materials uploaded
              </h3>
              <p className="text-sm text-text-secondary">
                Your instructor hasn't uploaded any documents yet.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Recordings */}
        <TabsContent value="recordings" className="mt-6">
          {mockRecordings.length > 0 ? (
            <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-bg-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Session Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockRecordings.map((file) => (
                    <tr
                      key={file.id}
                      className="hover:bg-bg-elevated transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-text-primary">
                        <div className="flex items-center gap-2">
                          <Video className="w-4 h-4 text-accent-critical" />
                          {file.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                        {file.duration}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-muted">
                        {file.size}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 bg-bg-surface border border-border rounded-lg flex flex-col items-center justify-center gap-3 py-16">
              <Video className="w-12 h-12 text-text-muted" />
              <h3 className="text-base font-medium text-text-primary">
                No recordings found
              </h3>
              <p className="text-sm text-text-secondary">
                Recorded lectures will be available after session broadcasts.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
